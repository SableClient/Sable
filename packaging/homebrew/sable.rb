# Generated from packaging/homebrew/sable.rb in SableClient/Sable. Edit it there.
cask 'sable' do
  version '1.20.0'
  sha256 '0000000000000000000000000000000000000000000000000000000000000000'

  url "https://github.com/SableClient/Sable/releases/download/v#{version}/Sable-#{version}-macos-universal.dmg",
      verified: 'github.com/SableClient/Sable/'
  name 'Sable'
  desc 'Client for the Matrix chat network'
  homepage 'https://sable.moe/'

  livecheck do
    url :url
    strategy :github_latest
  end

  # The app updates itself through tauri-plugin-updater.
  auto_updates true
  depends_on :macos

  app 'Sable.app'

  # The DMG is neither signed nor notarized, so Gatekeeper would refuse to open
  # it. Drop the quarantine flag the download picked up.
  postflight do
    system_command '/usr/bin/xattr',
                   args: ['-dr', 'com.apple.quarantine', "#{appdir}/Sable.app"]
  end

  uninstall quit: 'moe.sable.client'

  zap trash: [
    '~/Library/Application Support/moe.sable.client',
    '~/Library/Caches/moe.sable.client',
    '~/Library/HTTPStorages/moe.sable.client',
    '~/Library/Preferences/moe.sable.client.plist',
    '~/Library/Saved Application State/moe.sable.client.savedState',
    '~/Library/WebKit/moe.sable.client'
  ]
end
