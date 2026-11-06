package expo.modules.walletdriveauth

import android.accounts.Account
import android.app.Activity
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.api.Scope
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WalletDriveAuthModule : Module() {
  private var pending: Promise? = null
  private val requestCode = 46381
  private val driveScope = "https://www.googleapis.com/auth/drive.file"

  override fun definition() = ModuleDefinition {
    Name("WalletDriveAuth")

    AsyncFunction("authorize") { email: String?, interactive: Boolean, selectAccount: Boolean, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("drive/activity", "앱 화면을 연 뒤 다시 연결해 주세요.", null)
      } else if (pending != null) {
        promise.reject("drive/busy", "Google 연결이 진행 중입니다.", null)
      } else {
        pending = promise
        val builder = AuthorizationRequest.builder().setRequestedScopes(listOf(Scope(driveScope)))
        if (selectAccount) builder.setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT)
        else if (!email.isNullOrBlank()) builder.setAccount(Account(email, "com.google"))
        Identity.getAuthorizationClient(activity).authorize(builder.build())
          .addOnSuccessListener { result ->
            if (pending !== promise) return@addOnSuccessListener
            if (result.hasResolution()) {
              if (!interactive) fail("drive/consent", "Drive 연결 화면에서 Google 접근을 다시 허용해 주세요.")
              else try {
                val intent = result.pendingIntent ?: throw IllegalStateException()
                activity.startIntentSenderForResult(intent.intentSender, requestCode, null, 0, 0, 0)
              } catch (_: Exception) { fail("drive/authorization", "Google 연결 화면을 열지 못했습니다.") }
            } else finish(result)
          }
          .addOnFailureListener {
            if (pending === promise) fail("drive/authorization", "Google 연결에 실패했습니다. 계정과 앱 등록 설정을 확인해 주세요.")
          }
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("clearToken") { token: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) promise.reject("drive/activity", "앱을 다시 열어 주세요.", null)
      else Identity.getAuthorizationClient(context)
        .clearToken(ClearTokenRequest.builder().setToken(token).build())
        .addOnSuccessListener { promise.resolve() }
        .addOnFailureListener { promise.reject("drive/token", "Google 연결을 갱신하지 못했습니다.", null) }
    }

    OnActivityResult { activity, result ->
      if (result.requestCode == requestCode && pending != null) {
        if (result.resultCode != Activity.RESULT_OK) fail("drive/cancelled", "Google 연결을 취소했습니다.")
        else try { finish(Identity.getAuthorizationClient(activity).getAuthorizationResultFromIntent(result.data)) }
        catch (_: Exception) { fail("drive/authorization", "Google 접근 권한을 확인하지 못했습니다.") }
      }
    }
    OnDestroy { fail("drive/closed", "Google 연결 중 앱 화면이 닫혔습니다. 다시 연결해 주세요.") }
  }

  private fun finish(result: AuthorizationResult) {
    val token = result.accessToken
    if (token.isNullOrBlank() || !result.grantedScopes.contains(driveScope)) {
      fail("drive/consent", "선택한 파일에 대한 Drive 접근을 허용해 주세요.")
      return
    }
    val promise = pending
    pending = null
    promise?.resolve(mapOf("accessToken" to token))
  }

  private fun fail(code: String, message: String) {
    val promise = pending
    pending = null
    promise?.reject(code, message, null)
  }
}
