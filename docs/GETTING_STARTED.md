# Getting started (before the App Store release)

The backend is already deployed and running — there's nothing to host yourself. The Mac and
iPhone apps aren't published to the App Store / TestFlight yet (that's planned in the next few
months, once an Apple Developer Program membership is set up — see
[`docs/DEPLOYMENT.md`](DEPLOYMENT.md#5-not-done-yet-optional-later)). Until then, install both
apps yourself by building them from source with Xcode, as described below. Release builds talk
to the deployed backend automatically — no local server, no configuration.

## 1. Prerequisites

- A Mac with Xcode installed (from the Mac App Store).
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- [CocoaPods](https://cocoapods.org), via the checked-in `Gemfile`: `gem install bundler` (once), then `bundle install` inside `apps/ios`
- An iPhone (or the iOS Simulator) to run the iOS app on
- A free Apple ID is enough to install on your own iPhone — Xcode will re-sign the app roughly every 7 days, so you'll rebuild and reinstall periodically until the TestFlight release

## 2. Get the code

```bash
git clone https://github.com/<owner>/remotemacapp.git
cd remotemacapp
```

## 3. Build and run the Mac app

```bash
cd apps/mac/RemoteMac
xcodegen generate
open RemoteMac.xcodeproj
```

In Xcode, switch the scheme's build configuration to **Release** (Product → Scheme → Edit
Scheme → Run → Build Configuration → Release) so the app points at the deployed backend instead
of `localhost`, then Run.

## 4. Build and run the iPhone app

```bash
cd apps/ios
npm install
bundle install
cd ios && bundle exec pod install && cd ..
```

Open `apps/ios/ios/*.xcworkspace` in Xcode, select your iPhone (or a Simulator) as the run
destination, switch the scheme to **Release** the same way as the Mac app, and Run. Installing
on a physical iPhone over a free Apple ID needs your phone connected and trusted, and a one-time
"trust this developer" approval on the phone under Settings → General → VPN & Device Management.

## 5. Pair the two apps

1. Sign in (or register) on both apps — they talk to the same account on the deployed backend.
2. On the Mac app, register the device and note the pairing code it shows.
3. On the iPhone app, enter that code to request pairing, then approve it from the Mac app.

Once paired, screen and input sessions run peer-to-peer over WebRTC between the two
devices — the backend is only involved in auth, pairing, and signaling.

## Coming soon

Once distribution is set up, both apps will be installable directly — the iPhone app from
TestFlight/the App Store, the Mac app as a notarized `.dmg` — with no Xcode or source checkout
required. This document will be updated when that's live.
