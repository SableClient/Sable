package moe.sable.app.plugin.splashscreen

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.core.splashscreen.SplashScreen
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin

@TauriPlugin
class SplashScreenPlugin(private val activity: Activity) : Plugin(activity) {

    companion object {
        private const val TIMEOUT_MS = 10000L
    }

    @Volatile
    private var isAppReady = false
    private var splashScreen: SplashScreen? = null

    override fun load(webView: WebView) {
        splashScreen = activity.installSplashScreen()

        splashScreen?.setKeepOnScreenCondition {
            !isAppReady
        }

        splashScreen?.setOnExitAnimationListener { splashScreenViewProvider ->
            splashScreenViewProvider.remove()
        }

        Handler(Looper.getMainLooper()).postDelayed({
            isAppReady = true
        }, TIMEOUT_MS)
    }

    @Command
    fun close(invoke: Invoke) {
        isAppReady = true
        invoke.resolve()
    }
}