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
import androidx.activity.result.ActivityResult
import androidx.core.content.ContextCompat
import app.tauri.annotation.TauriPlugin
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.room.Room
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

@InvokeArg
internal class ConnectArgs {
    var operationId: String = ""
    var connectionId: String = ""
    var serverUrl: String = ""
    var participantToken: String = ""
    var audio: Boolean = false
    var video: Boolean = false
    var screenShare: Boolean = false
    lateinit var channel: Channel
}

@InvokeArg
internal class DisconnectArgs {
    var operationId: String = ""
    var connectionId: String = ""
}

@InvokeArg
internal class SetMediaEnabledArgs {
    var operationId: String = ""
    var connectionId: String = ""
    var kind: String = ""
    var enabled: Boolean = false
}

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

private data class PendingConnect(
    val invoke: Invoke,
    val args: ConnectArgs,
    val generation: Long,
    var settled: Boolean = false,
)

private data class PendingMedia(
    val invoke: Invoke,
    val args: SetMediaEnabledArgs,
    val generation: Long,
)

@TauriPlugin(
    permissions = [
        Permission(
            strings = ["android.permission.RECORD_AUDIO"],
            alias = "microphone",
        ),
        Permission(
            strings = ["android.permission.CAMERA"],
            alias = "camera",
        ),
    ],
)
class CallLifecyclePlugin(private val activity: Activity) : Plugin(activity) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var room: Room? = null
    private var roomEvents: Job? = null
    private var connectionJob: Job? = null
    private var generation = 0L
    private var activeOperationId: String? = null
    private var activeConnectionId: String? = null
    private var activeConnect: PendingConnect? = null
    private var activeEvents: Channel? = null
    private var pendingPermission: PendingConnect? = null
    private var pendingProjection: PendingConnect? = null
    private var pendingMediaPermission: PendingMedia? = null
    private var pendingMediaProjection: PendingMedia? = null
    private var projectionData: Intent? = null
    private var previousAudioMode: Int? = null
    private var previousSpeakerphoneState: Boolean? = null
    private val lastEventAt = mutableMapOf<String, Long>()
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
    fun connect(invoke: Invoke) {
        val args = runCatching { invoke.parseArgs(ConnectArgs::class.java) }.getOrNull()
        if (args == null || !args.isValid()) {
            invoke.reject("call connection failed", "connect_failed")
            return
        }

        if (isActive(args)) {
            invoke.resolve(result(args))
            return
        }
        if (isNativeRoomModeActive() || isPlatformLifecycleActive()) {
            invoke.reject("call connection failed", "connect_failed")
            return
        }

        val nextGeneration = generation + 1
        val pending = PendingConnect(invoke, args, nextGeneration)
        val missing = buildList {
            if (args.audio && !hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
                add("microphone")
            }
            if (args.video && !hasPermission(android.Manifest.permission.CAMERA)) {
                add("camera")
            }
        }
        if (missing.isNotEmpty()) {
            pendingPermission = pending
            requestPermissionForAliases(missing.toTypedArray(), invoke, "permissionResult")
            return
        }
        requestProjectionOrConnect(pending)
    }

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

        if (isNativeRoomModeActive()) {
            invoke.reject("platform lifecycle is busy", "busy")
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

    @Command
    fun disconnect(invoke: Invoke) {
        val args = runCatching { invoke.parseArgs(DisconnectArgs::class.java) }.getOrNull()
        if (args == null || args.operationId.isBlank() || args.connectionId.isBlank()) {
            invoke.reject("call shutdown failed", "close_failed")
            return
        }

        val pending = pendingPermission ?: pendingProjection
        if (pending != null) {
            if (pending.args.operationId != args.operationId || pending.args.connectionId != args.connectionId) {
                invoke.resolve()
                return
            }
            pendingPermission = null
            pendingProjection = null
            projectionData = null
            invoke.resolve()
            fail(pending, "connect_failed")
            return
        }

        if (activeOperationId != args.operationId || activeConnectionId != args.connectionId) {
            invoke.resolve()
            return
        }

        val closeGeneration = generation + 1
        generation = closeGeneration
        activeConnect?.let { fail(it, "connect_failed") }
        connectionJob?.cancel()
        scope.launch {
            val closeError = closeRoom(closeGeneration, emitResult = true)
            if (closeError) {
                invoke.reject("call shutdown failed", "close_failed")
            } else {
                invoke.resolve()
            }
        }
    }

    @Command
    fun setMediaEnabled(invoke: Invoke) {
        val args = runCatching { invoke.parseArgs(SetMediaEnabledArgs::class.java) }.getOrNull()
        val code = mediaCode(args?.kind)
        if (args == null || args.operationId.isBlank() || args.connectionId.isBlank() || code == null) {
            invoke.reject(errorMessage(code ?: "connect_failed"), code ?: "connect_failed")
            return
        }
        if (activeOperationId != args.operationId || activeConnectionId != args.connectionId || room == null) {
            invoke.reject(errorMessage(code), code)
            return
        }

        val currentGeneration = generation
        if (!args.enabled) {
            applyMediaToggle(args, currentGeneration, null, invoke)
            return
        }

        val missingAlias = when (args.kind) {
            "microphone" -> if (hasPermission(android.Manifest.permission.RECORD_AUDIO)) null else "microphone"
            "camera" -> if (hasPermission(android.Manifest.permission.CAMERA)) null else "camera"
            else -> null
        }
        if (missingAlias != null) {
            pendingMediaPermission = PendingMedia(invoke, args, currentGeneration)
            requestPermissionForAliases(arrayOf(missingAlias), invoke, "permissionResult")
            return
        }
        if (args.kind == "screen_share") {
            pendingMediaProjection = PendingMedia(invoke, args, currentGeneration)
            val manager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
            startActivityForResult(invoke, manager.createScreenCaptureIntent(), "projectionResult")
            return
        }
        applyMediaToggle(args, currentGeneration, null, invoke)
    }

    private fun applyMediaToggle(
        args: SetMediaEnabledArgs,
        expectedGeneration: Long,
        projection: Intent?,
        invoke: Invoke,
    ) {
        val code = mediaCode(args.kind) ?: "connect_failed"
        scope.launch {
            val current = room
            if (current == null || expectedGeneration != generation) {
                invoke.reject(errorMessage(code), code)
                return@launch
            }
            val ok = try {
                when (args.kind) {
                    "microphone" -> current.localParticipant.setMicrophoneEnabled(args.enabled)
                    "camera" -> current.localParticipant.setCameraEnabled(args.enabled)
                    else -> {
                        if (args.enabled) {
                            val data = projection ?: throw NativeFailure("screen_share_failed")
                            current.localParticipant.setScreenShareEnabled(true, ScreenCaptureParams(mediaProjectionPermissionResultData = data))
                        } else {
                            current.localParticipant.setScreenShareEnabled(false)
                        }
                    }
                }
            } catch (_: Exception) {
                false
            }
            if (expectedGeneration != generation || room !== current) {
                invoke.reject(errorMessage(code), code)
                return@launch
            }
            if (ok == true) {
                invoke.resolve(
                    JSObject()
                        .put("operationId", args.operationId)
                        .put("connectionId", args.connectionId),
                )
            } else {
                invoke.reject(errorMessage(code), code)
            }
        }
    }

    @PermissionCallback
    private fun permissionResult(invoke: Invoke) {
        run {
            val pending = pendingPlatformStart ?: return@run
            if (pending.invoke.id != invoke.id) return@run
            pendingPlatformStart = null
            if (hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
                beginPlatformLifecycle(pending.invoke, pending.args)
            } else {
                failPlatformStart(pending, "permission_denied")
            }
            return
        }
        run {
            val pending = pendingMediaPermission ?: return@run
            if (pending.invoke.id != invoke.id) return@run
            pendingMediaPermission = null
            val granted = when (pending.args.kind) {
                "microphone" -> hasPermission(android.Manifest.permission.RECORD_AUDIO)
                else -> hasPermission(android.Manifest.permission.CAMERA)
            }
            if (granted) {
                applyMediaToggle(pending.args, pending.generation, null, pending.invoke)
            } else {
                val code = mediaCode(pending.args.kind) ?: "connect_failed"
                pending.invoke.reject(errorMessage(code), code)
            }
            return
        }
        val pending = pendingPermission ?: return
        if (pending.invoke.id != invoke.id) return
        pendingPermission = null

        when {
            pending.args.audio && !hasPermission(android.Manifest.permission.RECORD_AUDIO) ->
                fail(pending, "audio_failed")
            pending.args.video && !hasPermission(android.Manifest.permission.CAMERA) ->
                fail(pending, "camera_failed")
            else -> requestProjectionOrConnect(pending)
        }
    }

    @ActivityCallback
    private fun projectionResult(invoke: Invoke, result: ActivityResult) {
        run {
            val pending = pendingMediaProjection ?: return@run
            if (pending.invoke.id != invoke.id) return@run
            pendingMediaProjection = null
            if (result.resultCode != Activity.RESULT_OK || result.data == null) {
                pending.invoke.reject(errorMessage("screen_share_failed"), "screen_share_failed")
            } else {
                applyMediaToggle(pending.args, pending.generation, result.data, pending.invoke)
            }
            return
        }
        val pending = pendingProjection ?: return
        if (pending.invoke.id != invoke.id) return
        pendingProjection = null
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            fail(pending, "screen_share_failed")
            return
        }
        projectionData = result.data
        beginConnect(pending)
    }

    override fun onDestroy(activity: androidx.appcompat.app.AppCompatActivity) {
        pendingPlatformStart = null
        releasePlatformLifecycle()
        roomEvents?.cancel()
        connectionJob?.cancel()
        val closeGeneration = generation + 1
        generation = closeGeneration
        scope.launch {
            closeRoom(closeGeneration)
            scope.cancel()
        }
        super.onDestroy(activity)
    }

    private fun requestProjectionOrConnect(pending: PendingConnect) {
        if (!pending.args.screenShare) {
            beginConnect(pending)
            return
        }

        pendingProjection = pending
        val manager = activity.getSystemService(Context.MEDIA_PROJECTION_SERVICE) as android.media.projection.MediaProjectionManager
        startActivityForResult(
            pending.invoke,
            manager.createScreenCaptureIntent(),
            "projectionResult",
        )
    }

    private fun beginConnect(pending: PendingConnect) {
        if (pending.generation <= generation || room != null) {
            fail(pending, "connect_failed")
            return
        }
        generation = pending.generation
        activeOperationId = pending.args.operationId
        activeConnectionId = pending.args.connectionId
        activeConnect = pending
        activeEvents = pending.args.channel
        lastEventAt.clear()

        connectionJob = scope.launch {
            try {
                connectRoom(pending)
                if (!isCurrent(pending.generation, room)) {
                    fail(pending, "connect_failed")
                    return@launch
                }
                resolve(pending)
            } catch (_: StaleConnection) {
                fail(pending, "connect_failed")
                return@launch
            } catch (_: CancellationException) {
                fail(pending, "connect_failed")
                return@launch
            } catch (failure: NativeFailure) {
                if (!isCurrent(pending.generation, room)) {
                    fail(pending, "connect_failed")
                    return@launch
                }
                fail(pending, failure.code)
                closeRoom(pending.generation)
            } catch (_: Exception) {
                if (!isCurrent(pending.generation, room)) {
                    fail(pending, "connect_failed")
                    return@launch
                }
                fail(pending, "connect_failed")
                closeRoom(pending.generation)
            }
        }
    }

    private suspend fun connectRoom(pending: PendingConnect) {
        val args = pending.args
        val newRoom = LiveKit.create(activity.applicationContext)
        room = newRoom
        roomEvents = scope.launch {
            newRoom.events.collect { event -> handleRoomEvent(pending.generation, event) }
        }

        try {
            newRoom.connect(args.serverUrl, args.participantToken)
            ensureCurrent(pending.generation, newRoom)
            if (args.audio) {
                configureAudio()
                if (newRoom.localParticipant.setMicrophoneEnabled(true) != true) {
                    throw NativeFailure("audio_failed")
                }
                ensureCurrent(pending.generation, newRoom)
            }
            if (args.video) {
                if (newRoom.localParticipant.setCameraEnabled(true) != true) {
                    throw NativeFailure("video_failed")
                }
                ensureCurrent(pending.generation, newRoom)
            }
            if (args.screenShare) {
                val data = projectionData ?: throw NativeFailure("screen_share_failed")
                val options = ScreenCaptureParams(
                    mediaProjectionPermissionResultData = data,
                )
                if (newRoom.localParticipant.setScreenShareEnabled(true, options) != true) {
                    throw NativeFailure("screen_share_failed")
                }
                ensureCurrent(pending.generation, newRoom)
                projectionData = null
            }
        } catch (failure: NativeFailure) {
            throw failure
        } catch (failure: StaleConnection) {
            throw failure
        } catch (failure: CancellationException) {
            throw failure
        } catch (_: SecurityException) {
            throw NativeFailure(if (args.audio) "audio_failed" else "camera_failed")
        } catch (_: Exception) {
            throw NativeFailure("connect_failed")
        }
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

    private fun isNativeRoomModeActive(): Boolean =
        room != null || activeConnect != null || pendingPermission != null || pendingProjection != null

    private fun isPlatformLifecycleActive(): Boolean = platformSessionId != null

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

    private suspend fun closeRoom(closeGeneration: Long, emitResult: Boolean = false): Boolean {
        if (closeGeneration != generation) return false
        val current = room ?: return false
        room = null
        roomEvents?.cancel()
        roomEvents = null
        projectionData = null
        val failed = try {
            current.disconnect()
            false
        } catch (_: Exception) {
            true
        }
        if (emitResult) {
            emit(if (failed) "failed" else "disconnected", if (failed) "close_failed" else null, closeGeneration)
        }
        restoreAudio()
        activeOperationId = null
        activeConnectionId = null
        activeConnect = null
        activeEvents = null
        return failed
    }

    private fun handleRoomEvent(eventGeneration: Long, event: RoomEvent) {
        if (eventGeneration != generation) return
        when (event) {
            is RoomEvent.Reconnecting -> emit("reconnecting", null, eventGeneration)
            is RoomEvent.Reconnected -> emit("reconnected", null, eventGeneration)
            is RoomEvent.Disconnected -> {
                emit("disconnected", null, eventGeneration)
                scope.launch { closeRoom(eventGeneration) }
            }
            else -> Unit
        }
    }

    private fun emit(type: String, code: String?, _eventGeneration: Long) {
        val channel = activeEvents ?: return
        val now = SystemClock.elapsedRealtime()
        val previous = lastEventAt[type]
        if (type != "failed" && previous != null && now - previous < EVENT_INTERVAL_MS) return
        lastEventAt[type] = now
        val payload = JSObject()
            .put("operationId", activeOperationId)
            .put("connectionId", activeConnectionId)
            .put("event", type)
        if (code != null) payload.put("code", code)
        channel.send(payload)
    }

    private fun fail(pending: PendingConnect, code: String) {
        if (pending.settled) return
        pending.settled = true
        val args = pending.args
        val safeCode = if (code in ERROR_CODES) code else "connect_failed"
        args.channel.sendObject(
            mapOf(
                "operationId" to args.operationId,
                "connectionId" to args.connectionId,
                "event" to "failed",
                "code" to safeCode,
            ),
        )
        pending.invoke.reject(errorMessage(safeCode), safeCode)
    }

    private fun resolve(pending: PendingConnect) {
        if (pending.settled) return
        pending.settled = true
        pending.invoke.resolve(result(pending.args))
    }

    private fun isActive(args: ConnectArgs): Boolean =
        room != null && activeOperationId == args.operationId && activeConnectionId == args.connectionId

    private fun isCurrent(candidateGeneration: Long, candidateRoom: Room?): Boolean =
        generation == candidateGeneration && room === candidateRoom

    private fun ensureCurrent(candidateGeneration: Long, candidateRoom: Room) {
        if (!isCurrent(candidateGeneration, candidateRoom)) throw StaleConnection()
    }

    private fun result(args: ConnectArgs): JSObject = JSObject()
        .put("operationId", args.operationId)
        .put("connectionId", args.connectionId)

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED

    private fun configureAudio() {
        val audioManager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (previousAudioMode == null) previousAudioMode = audioManager.mode
        if (previousSpeakerphoneState == null) previousSpeakerphoneState = audioManager.isSpeakerphoneOn
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        audioManager.isSpeakerphoneOn = true
    }

    private fun restoreAudio() {
        val audioManager = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        previousAudioMode?.let { audioManager.mode = it }
        previousSpeakerphoneState?.let { audioManager.isSpeakerphoneOn = it }
        previousAudioMode = null
        previousSpeakerphoneState = null
    }

    private fun mediaCode(kind: String?): String? = when (kind) {
        "microphone" -> "audio_failed"
        "camera" -> "camera_failed"
        "screen_share" -> "screen_share_failed"
        else -> null
    }

    private fun errorMessage(code: String): String = when (code) {
        "audio_failed" -> "native audio failed"
        "camera_failed" -> "native camera failed"
        "video_failed" -> "native video failed"
        "screen_share_failed" -> "native screen share failed"
        "close_failed" -> "call shutdown failed"
        else -> "call connection failed"
    }

    private class NativeFailure(val code: String) : Exception()

    private class StaleConnection : Exception()

    private fun ConnectArgs.isValid(): Boolean =
        operationId.isNotBlank() && connectionId.isNotBlank() && serverUrl.isNotBlank() &&
            participantToken.isNotBlank() && runCatching { channel }.isSuccess

    companion object {
        private const val EVENT_INTERVAL_MS = 1_000L
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
        private val ERROR_CODES = setOf(
            "connect_failed",
            "audio_failed",
            "camera_failed",
            "video_failed",
            "screen_share_failed",
            "close_failed",
        )
    }
}
