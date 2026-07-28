package app.tauri.call_lifecycle

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
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

private data class PendingConnect(
    val invoke: Invoke,
    val args: ConnectArgs,
    val generation: Long,
    var settled: Boolean = false,
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
    private var projectionData: Intent? = null
    private var previousAudioMode: Int? = null
    private var previousSpeakerphoneState: Boolean? = null
    private val lastEventAt = mutableMapOf<String, Long>()

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
        if (room != null || pendingPermission != null || pendingProjection != null) {
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

    @PermissionCallback
    private fun permissionResult(invoke: Invoke) {
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
