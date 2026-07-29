package app.tauri.call_lifecycle

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Owns only the Android foreground-service notification for a JS-owned room.
 * The WebView and LiveKit JS remain the owners of the room and its tracks.
 */
class CallLifecycleForegroundService : Service() {
    /** Positive acknowledgement of foreground promotion for the owning plugin. */
    interface StartListener {
        fun onServiceStarted()
        fun onServiceStartFailed()
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val wantsMicrophone = intent?.getBooleanExtra(EXTRA_MICROPHONE, false) ?: false
        val wantsPlayback = intent?.getBooleanExtra(EXTRA_PLAYBACK, false) ?: false
        val started = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                var types = 0
                if (wantsMicrophone) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                if (wantsPlayback) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                if (types != 0) {
                    startForeground(NOTIFICATION_ID, buildNotification(), types)
                } else {
                    startForeground(NOTIFICATION_ID, buildNotification())
                }
            } else {
                startForeground(NOTIFICATION_ID, buildNotification())
            }
            true
        } catch (_: SecurityException) {
            false
        } catch (_: IllegalArgumentException) {
            false
        } catch (_: IllegalStateException) {
            false
        }
        if (started) {
            activeStartListener?.onServiceStarted()
        } else {
            stopSelfResult(startId)
            activeStartListener?.onServiceStartFailed()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        super.onDestroy()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Call audio",
            NotificationManager.IMPORTANCE_LOW,
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentTitle("Call in progress")
        .setContentText("Microphone and call audio are active")
        .setCategory(Notification.CATEGORY_CALL)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .build()

    companion object {
        const val EXTRA_MICROPHONE = "app.tauri.call_lifecycle.extra.MICROPHONE"
        const val EXTRA_PLAYBACK = "app.tauri.call_lifecycle.extra.PLAYBACK"

        @Volatile
        var activeStartListener: StartListener? = null

        private const val CHANNEL_ID = "call_lifecycle_audio"
        private const val NOTIFICATION_ID = 1396
    }
}
