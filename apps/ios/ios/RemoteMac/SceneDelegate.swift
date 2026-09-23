import UIKit

/// This SDK requires the UIScene app lifecycle — React Native's default template
/// (as of 0.87.1) still assumes the older plain UIApplicationDelegate window setup,
/// so this delegate does what AppDelegate used to do: create the window and start
/// React Native's root view controller in it.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    guard let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window

    factory.startReactNative(
      withModuleName: "RemoteMac",
      in: window,
      launchOptions: nil
    )
  }
}
