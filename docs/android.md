# Rox Shield Android app (rox-admin) integration

Shop users of the `rox-admin` app can chat with and call Roxan Labs support **without a second
login**: the app trades its existing Rox Shield session for a support identity token and opens the
hosted support screen in a WebView.

```
rox-admin (logged in, has Rox Shield JWT)
  │ POST {BASE_URL}/support/identity/rox-shield   Authorization: Bearer <accessToken>
  │◄─ { appId, identityToken, expiresIn: 300 }
  ▼
WebView → https://support.roxanlabs.com/embed?appId=<appId>#token=<identityToken>
          (the dashboard's /embed page = full-screen <SupportWidget mode="embedded"/>)
```

Agents see the shop's live Rox Shield account (shop, plan, KYC, devices, branch, role) in the
customer panel.

## One-time setup

1. Dashboard → Settings → **New application**: name "Rox Shield Admin App", platform Android,
   enable **Rox Shield accounts**. Add the dashboard origin (e.g. `https://support.roxanlabs.com`)
   to *Allowed origins*.
2. Backend `.env`: `SUPPORT_ROX_SHIELD_APP_ID=<the app_… id>`.

## 1. Fetch an identity token (NetworkService)

`rox-admin` already has `NetworkService.makeAuthorizedRequest` (Bearer token + automatic refresh).
Add:

```kotlin
// network/NetworkService.kt
data class SupportIdentity(val appId: String, val identityToken: String)

suspend fun getSupportIdentity(): Result<SupportIdentity> = withContext(Dispatchers.IO) {
    try {
        val (code, body) = makeAuthorizedRequest("$baseUrl/support/identity/rox-shield", "POST", "{}")
        if (code == HttpURLConnection.HTTP_OK || code == HttpURLConnection.HTTP_CREATED) {
            val json = JSONObject(body)
            Result.success(SupportIdentity(json.getString("appId"), json.getString("identityToken")))
        } else Result.failure(Exception("Support unavailable ($code)"))
    } catch (e: Exception) {
        Result.failure(e)
    }
}
```

## 2. Support screen (WebView)

```kotlin
// AndroidManifest.xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

```kotlin
class SupportActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private val network by lazy { NetworkService(this) }
    private var pendingPermission: PermissionRequest? = null

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        pendingPermission?.let { if (granted) it.grant(it.resources) else it.deny() }
        pendingPermission = null
    }

    /** Exposed to the page as window.RoxSupportBridge. Methods run on a background thread. */
    inner class Bridge {
        @JavascriptInterface
        fun getIdentityToken(): String =
            runBlocking { network.getSupportIdentity().getOrNull()?.identityToken.orEmpty() }

        @JavascriptInterface
        fun getPushToken(): String =
            runCatching { Tasks.await(FirebaseMessaging.getInstance().token) }.getOrDefault("")

        @JavascriptInterface
        fun onUnreadChange(count: Int) { /* update a badge if you like */ }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true                 // anonymous/visitor + UI state
            settings.mediaPlaybackRequiresUserGesture = false // ringtone + remote audio
            addJavascriptInterface(Bridge(), "RoxSupportBridge")
            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    // calls + voice messages need the microphone
                    if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources) {
                        if (ContextCompat.checkSelfPermission(this@SupportActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                            request.grant(request.resources)
                        } else {
                            pendingPermission = request
                            micPermission.launch(Manifest.permission.RECORD_AUDIO)
                        }
                    } else request.deny()
                }
                // file / image picker for attachments
                override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    fileCallback = callback
                    filePicker.launch(params.createIntent())
                    return true
                }
            }
        }
        setContentView(webView)

        lifecycleScope.launch {
            network.getSupportIdentity()
                .onSuccess { id ->
                    // token goes in the #fragment: never sent to the server or written to logs
                    webView.loadUrl("${BuildConfig.SUPPORT_WEB_URL}/embed?appId=${id.appId}#token=${id.identityToken}")
                }
                .onFailure { Toast.makeText(this@SupportActivity, it.message, Toast.LENGTH_LONG).show() }
        }
    }

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data))
        fileCallback = null
    }

    override fun onDestroy() {
        webView.destroy() // hangs up any active call
        super.onDestroy()
    }
}
```

`build.gradle.kts`: `buildConfigField("String", "SUPPORT_WEB_URL", "\"https://support.roxanlabs.com\"")`.

Optional `?color=1d2c80` on the embed URL overrides the brand colour.

## 3. Push notifications (FCM)

When the embed page loads it calls `RoxSupportBridge.getPushToken()` and registers it
(`POST /api/support/widget/push-token`). While the user has no support screen open, the backend
sends FCM messages for **agent replies**, **missed calls from an agent** and **conversation
resolved**, with `data.source = "rox-support"`:

```kotlin
// your FirebaseMessagingService
override fun onMessageReceived(message: RemoteMessage) {
    if (message.data["source"] == "rox-support") {
        showNotification(
            title = message.notification?.title ?: "Support",
            body = message.notification?.body ?: "",
            intent = Intent(this, SupportActivity::class.java)
        )
        return
    }
    // … existing Rox Shield handling
}
```

The Rox Shield backend already initialises firebase-admin from `firebase-service-account.json`,
so nothing else is required server-side.

## Native-only alternative

If you later want a fully native chat UI, the protocol is plain REST + Socket.IO (documented in
`api.md` and `socket-events.md`): use `socket.io-client-java`, and Google's `webrtc` Android
library with the same signaling messages (`call:start`, `call:accept`, `call:signal` …).
