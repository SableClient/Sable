package app.tauri.call_lifecycle

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.core.content.ContextCompat
import app.tauri.annotation.TauriPlugin
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
internal class PlatformLifecycleStartArgs {
    var sessionId: String = ""
    var microphone: Boolean = false
    var playback: Boolean = false
    lateinit var channel: Channel
}

@InvokeArg
internal class PlatformLifecycleStopArgs {
    var sessionId: String = ""
}

@TauriPlugin(
    permissions = [
        Permission(
            strings = ["android.permission.RECORD_AUDIO"],
            alias = "microphone",
        ),
    ],
)
class CallLifecyclePlugin(private val activity: Activity) : Plugin(activity) {
    private var previousAudioMode: Int? = null
    private val lastPlatformEventAt = mutableMapOf<String, Long>()
    private var platformSessionId: String? = null
    private var platformRevision = 0L
    private var platformState = PLATFORM_IDLE
    private var platformChannel: Channel? = null
    private var platformFocus = PLATFORM_FOCUS_NONE
    private var platformRoute = PLATFORM_ROUTE_UNKNOWN
    private var platformMicrophone = false
    private var platformPlayback = false
    private var platformFocusRequest: AudioFocusRequest? = null
    private var platformAudioManager: AudioManager? = null
    private var platformAudioCallback: AudioDeviceCallback? = null
    private var pendingPlatformStart: PendingPlatformStart? = null

    private data class PendingPlatformStart(
        val invoke: Invoke,
        val args: PlatformLifecycleStartArgs,
    )

    @Command
    fun getPlatformLifecycleCapabilities(invoke: Invoke) {
        invoke.resolve(
            JSObject()
                .put("platform", "android")
                .put("microphone", true)
                .put("audioPlayback", true)
                .put("audioFocus", true)
                .put("routeEvents", true)
                .put("foregroundService", true)
                .put("backgroundJavascript", false)
                .put("camera", false)
                .put("screenShare", false),
        )
    }

    @Command
    fun startPlatformLifecycle(invoke: Invoke) {
        val args = runCatching { invoke.parseArgs(PlatformLifecycleStartArgs::class.java) }.getOrNull()
        if (args == null || args.sessionId.isBlank() || !hasChannel(args)) {
            invoke.reject("platform lifecycle start failed", "invalid_request")
            return
        }

        if (platformSessionId != null && platformSessionId != args.sessionId) {
            invoke.reject("platform lifecycle is busy", "busy")
            return
        }
        if (platformSessionId == args.sessionId) {
            invoke.resolve(platformLifecycleState())
            return
        }
        if (!isActivityVisible()) {
            invoke.reject("platform lifecycle requires a visible activity", "not_visible")
            return
        }

        platformSessionId = args.sessionId
        platformChannel = args.channel
        platformMicrophone = args.microphone
        platformPlayback = args.playback
        platformState = PLATFORM_STARTING
        bumpPlatformRevision()

        if (args.microphone && !hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
            val pending = PendingPlatformStart(invoke, args)
            pendingPlatformStart = pending
            try {
                requestPermissionForAliases(arrayOf("microphone"), invoke, "permissionResult")
            } catch (_: Exception) {
                pendingPlatformStart = null
                failPlatformStart(pending, "permission_denied")
            }
            return
        }
        beginPlatformLifecycle(invoke, args)
    }

    @Command
    fun stopPlatformLifecycle(invoke: Invoke) {
        val args = runCatching { invoke.parseArgs(PlatformLifecycleStopArgs::class.java) }.getOrNull()
        if (args == null || args.sessionId.isBlank()) {
            invoke.reject("platform lifecycle stop failed", "invalid_request")
            return
        }
        if (platformSessionId != args.sessionId) {
            // A stale stop must never tear down a replacement session.
            invoke.resolve(platformLifecycleState())
            return
        }

        pendingPlatformStart = null
        releasePlatformLifecycle()
        invoke.resolve(platformLifecycleState())
    }

    @Command
    fun getPlatformLifecycleState(invoke: Invoke) {
        invoke.resolve(platformLifecycleState())
    }

    @PermissionCallback
    private fun permissionResult(invoke: Invoke) {
        val pending = pendingPlatformStart ?: return
        if (pending.invoke.id != invoke.id) return
        pendingPlatformStart = null
        if (hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
            beginPlatformLifecycle(pending.invoke, pending.args)
        } else {
            failPlatformStart(pending, "permission_denied")
        }
    }

    override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
        pendingPlatformStart = null
        releasePlatformLifecycle()
        super.onDestroy(activity)
    }

    private fun beginPlatformLifecycle(invoke: Invoke, args: PlatformLifecycleStartArgs) {
        if (platformSessionId != args.sessionId || !isActivityVisible()) {
            failPlatformStart(PendingPlatformStart(invoke, args), "not_visible")
            return
        }
        val audioManager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        platformAudioManager = audioManager
        try {
            if (args.microphone) {
                if (previousAudioMode == null) previousAudioMode = audioManager.mode
                audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                if (!requestPlatformAudioFocus(audioManager)) {
                    failPlatformStart(PendingPlatformStart(invoke, args), "audio_focus_failed")
                    return
                }
            }
            // The platform lifecycle only reports active once the foreground
            // service positively acknowledges its promotion.
            registerServiceStartAck(PendingPlatformStart(invoke, args))
            startPlatformService(args)
        } catch (_: SecurityException) {
            CallLifecycleForegroundService.activeStartListener = null
            failPlatformStart(PendingPlatformStart(invoke, args), "service_start_failed")
        } catch (_: IllegalStateException) {
            CallLifecycleForegroundService.activeStartListener = null
            failPlatformStart(PendingPlatformStart(invoke, args), "service_start_failed")
        } catch (_: RuntimeException) {
            CallLifecycleForegroundService.activeStartListener = null
            failPlatformStart(PendingPlatformStart(invoke, args), "service_start_failed")
        }
    }

    private fun registerServiceStartAck(pending: PendingPlatformStart) {
        val mainHandler = Handler(Looper.getMainLooper())
        val sessionId = pending.args.sessionId
        CallLifecycleForegroundService.activeStartListener =
            object : CallLifecycleForegroundService.StartListener {
                override fun onServiceStarted() {
                    mainHandler.post { completeServiceStart(pending, failed = false) }
                }

                override fun onServiceStartFailed() {
                    mainHandler.post { completeServiceStart(pending, failed = true) }
                }
            }
        mainHandler.postDelayed({ completeServiceStartTimeout(pending, sessionId) }, SERVICE_START_TIMEOUT_MS)
    }

    private fun completeServiceStart(pending: PendingPlatformStart, failed: Boolean) {
        CallLifecycleForegroundService.activeStartListener = null
        if (platformSessionId != pending.args.sessionId || platformState != PLATFORM_STARTING) return
        if (failed) {
            failPlatformStart(pending, "service_start_failed")
            return
        }
        val audioManager = platformAudioManager ?: return
        registerPlatformAudioRoutes(audioManager)
        platformState = PLATFORM_ACTIVE
        bumpPlatformRevision()
        pending.invoke.resolve(platformLifecycleState())
        if (pending.args.microphone) emitPlatformFocus(PLATFORM_FOCUS_GAINED)
        emitPlatformRoute(platformRoute)
    }

    private fun completeServiceStartTimeout(pending: PendingPlatformStart, sessionId: String) {
        if (platformSessionId != sessionId || platformState != PLATFORM_STARTING) return
        CallLifecycleForegroundService.activeStartListener = null
        failPlatformStart(pending, "service_start_failed")
    }

    private fun requestPlatformAudioFocus(audioManager: AudioManager): Boolean {
        val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attributes)
                .setOnAudioFocusChangeListener(platformFocusListener, Handler(Looper.getMainLooper()))
                .setWillPauseWhenDucked(false)
                .build()
            platformFocusRequest = request
            audioManager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(
                platformFocusListener,
                AudioManager.STREAM_VOICE_CALL,
                AudioManager.AUDIOFOCUS_GAIN,
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
    }

    private fun startPlatformService(args: PlatformLifecycleStartArgs) {
        val intent = Intent(activity, CallLifecycleForegroundService::class.java)
            .putExtra(CallLifecycleForegroundService.EXTRA_MICROPHONE, args.microphone)
            .putExtra(CallLifecycleForegroundService.EXTRA_PLAYBACK, args.playback)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(activity, intent)
        } else {
            @Suppress("DEPRECATION")
            activity.startService(intent)
        }
    }

    private fun registerPlatformAudioRoutes(audioManager: AudioManager) {
        platformRoute = currentPlatformRoute(audioManager)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val callback = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
                handlePlatformRouteChanged()
            }

            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
                handlePlatformRouteChanged()
            }
        }
        platformAudioCallback = callback
        audioManager.registerAudioDeviceCallback(callback, Handler(Looper.getMainLooper()))
    }

    private fun handlePlatformRouteChanged() {
        val audioManager = platformAudioManager ?: return
        val route = currentPlatformRoute(audioManager)
        if (route != platformRoute) {
            platformRoute = route
            emitPlatformRoute(route)
        }
    }

    private fun currentPlatformRoute(audioManager: AudioManager): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val types = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).map { it.type }.toSet()
            return when {
                types.any { it == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP || it == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                    (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && it == AudioDeviceInfo.TYPE_BLE_HEADSET) } ->
                    PLATFORM_ROUTE_BLUETOOTH
                types.any { it == AudioDeviceInfo.TYPE_WIRED_HEADSET || it == AudioDeviceInfo.TYPE_WIRED_HEADPHONES } ->
                    PLATFORM_ROUTE_WIRED
                types.any { it == AudioDeviceInfo.TYPE_USB_DEVICE || it == AudioDeviceInfo.TYPE_USB_HEADSET } ->
                    PLATFORM_ROUTE_USB
                types.any { it == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE } -> PLATFORM_ROUTE_EARPIECE
                types.any { it == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER } -> PLATFORM_ROUTE_SPEAKER
                else -> PLATFORM_ROUTE_UNKNOWN
            }
        }
        @Suppress("DEPRECATION")
        return when {
            audioManager.isBluetoothA2dpOn || audioManager.isBluetoothScoOn -> PLATFORM_ROUTE_BLUETOOTH
            audioManager.isWiredHeadsetOn -> PLATFORM_ROUTE_WIRED
            audioManager.isSpeakerphoneOn -> PLATFORM_ROUTE_SPEAKER
            else -> PLATFORM_ROUTE_UNKNOWN
        }
    }

    private fun emitPlatformFocus(focus: String) {
        platformFocus = focus
        emitPlatformEvent("focus", focus = focus)
    }

    private fun emitPlatformRoute(route: String) {
        emitPlatformEvent("route", route = route)
    }

    private fun emitPlatformEvent(
        event: String,
        focus: String? = null,
        route: String? = null,
        code: String? = null,
    ) {
        val channel = platformChannel ?: return
        val now = SystemClock.elapsedRealtime()
        val previous = lastPlatformEventAt[event]
        if (event != "failure" && previous != null && now - previous < PLATFORM_EVENT_INTERVAL_MS) return
        lastPlatformEventAt[event] = now
        bumpPlatformRevision()
        val payload = JSObject()
            .put("sessionId", platformSessionId)
            .put("revision", platformRevision)
            .put("event", event)
        focus?.let { payload.put("focus", it) }
        route?.let { payload.put("route", it) }
        code?.let { payload.put("code", it) }
        channel.send(payload)
    }

    private fun emitPlatformFailure(code: String) {
        val safeCode = if (code in PLATFORM_FAILURE_CODES) code else "service_start_failed"
        emitPlatformEvent("failure", code = safeCode)
    }

    private fun failPlatformStart(pending: PendingPlatformStart, code: String) {
        emitPlatformFailure(code)
        pending.invoke.reject("platform lifecycle start failed", if (code in PLATFORM_FAILURE_CODES) code else "service_start_failed")
        releasePlatformLifecycle()
    }

    private fun releasePlatformLifecycle() {
        CallLifecycleForegroundService.activeStartListener = null
        platformAudioCallback?.let { callback ->
            platformAudioManager?.let { manager ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    manager.unregisterAudioDeviceCallback(callback)
                }
            }
        }
        platformAudioCallback = null
        platformAudioManager?.let { manager ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                platformFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                manager.abandonAudioFocus(platformFocusListener)
            }
        }
        platformFocusRequest = null
        platformAudioManager = null
        activity.stopService(Intent(activity, CallLifecycleForegroundService::class.java))
        restoreAudio()
        val hadState = platformSessionId != null || platformState != PLATFORM_IDLE
        platformSessionId = null
        platformChannel = null
        platformFocus = PLATFORM_FOCUS_NONE
        platformRoute = PLATFORM_ROUTE_UNKNOWN
        platformMicrophone = false
        platformPlayback = false
        lastPlatformEventAt.clear()
        platformState = PLATFORM_IDLE
        if (hadState) bumpPlatformRevision()
    }

    private fun platformLifecycleState(): JSObject = JSObject()
        .put("sessionId", platformSessionId)
        .put("revision", platformRevision)
        .put("state", platformState)
        .put("focus", platformFocus)
        .put("route", platformRoute)
        .put("microphone", platformMicrophone)
        .put("playback", platformPlayback)
        .put("backgroundJavascript", false)

    private fun bumpPlatformRevision() {
        platformRevision = if (platformRevision == Long.MAX_VALUE) 1L else platformRevision + 1L
    }

    private fun hasChannel(args: PlatformLifecycleStartArgs): Boolean =
        runCatching { args.channel }.isSuccess

    private fun isActivityVisible(): Boolean =
        !activity.isFinishing &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.JELLY_BEAN_MR1 || !activity.isDestroyed) &&
            activity.window.decorView.isShown &&
            activity.hasWindowFocus()

    private val platformFocusListener = AudioManager.OnAudioFocusChangeListener { change ->
        val update = {
            when (change) {
                AudioManager.AUDIOFOCUS_GAIN -> emitPlatformFocus(PLATFORM_FOCUS_GAINED)
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> emitPlatformFocus(PLATFORM_FOCUS_DUCKED)
                AudioManager.AUDIOFOCUS_LOSS,
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> emitPlatformFocus(PLATFORM_FOCUS_LOST)
                else -> Unit
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) update() else activity.runOnUiThread(update)
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED

    private fun restoreAudio() {
        val audioManager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        previousAudioMode?.let { audioManager.mode = it }
        previousAudioMode = null
    }

    companion object {
        private const val PLATFORM_EVENT_INTERVAL_MS = 1_000L
        private const val SERVICE_START_TIMEOUT_MS = 1_500L
        private const val PLATFORM_IDLE = "idle"
        private const val PLATFORM_STARTING = "starting"
        private const val PLATFORM_ACTIVE = "active"
        private const val PLATFORM_FOCUS_NONE = "none"
        private const val PLATFORM_FOCUS_GAINED = "gained"
        private const val PLATFORM_FOCUS_LOST = "lost"
        private const val PLATFORM_FOCUS_DUCKED = "ducked"
        private const val PLATFORM_ROUTE_UNKNOWN = "unknown"
        private const val PLATFORM_ROUTE_EARPIECE = "earpiece"
        private const val PLATFORM_ROUTE_SPEAKER = "speaker"
        private const val PLATFORM_ROUTE_WIRED = "wired"
        private const val PLATFORM_ROUTE_BLUETOOTH = "bluetooth"
        private const val PLATFORM_ROUTE_USB = "usb"
        private val PLATFORM_FAILURE_CODES = setOf(
            "invalid_request",
            "busy",
            "not_visible",
            "permission_denied",
            "audio_focus_failed",
            "service_start_failed",
        )
    }
}
