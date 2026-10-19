#!/usr/bin/env bash
# Generates the Android project from scratch and applies our overlay. Run from native/.
set -euo pipefail
VERSION_CODE="${1:-1}"
VERSION_NAME="${2:-1.0.0}"

rm -rf android www
mkdir -p www
cp -r ../index.html ../app.js ../config.js ../styles.css ../manifest.json ../icons www/

npx cap add android
npx cap sync android

APP=android/app
cp overlay/google-services.json $APP/google-services.json
cp overlay/AndroidManifest.xml $APP/src/main/AndroidManifest.xml
cp overlay/MainActivity.java $APP/src/main/java/com/wmcmedicine/app/MainActivity.java
mkdir -p $APP/src/main/res/drawable $APP/src/main/res/values
cp overlay/ic_stat_notify.xml $APP/src/main/res/drawable/ic_stat_notify.xml
cat > $APP/src/main/res/values/colors_notify.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources><color name="notify">#0B3D5C</color></resources>
XML
cat > $APP/src/main/res/values/ic_launcher_background.xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<resources><color name="ic_launcher_background">#0B3D5C</color></resources>
XML

# Launcher icons from the web icon
python3 - <<'PY'
from PIL import Image
import os
src=Image.open('../icons/icon-512.png').convert('RGBA')
for d,s in {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}.items():
    base=f'android/app/src/main/res/mipmap-{d}'; os.makedirs(base,exist_ok=True)
    im=src.resize((s,s),Image.LANCZOS)
    for n in ('ic_launcher','ic_launcher_round','ic_launcher_foreground'): im.save(f'{base}/{n}.png')
print('icons ok')
PY

# Version
sed -i "s/versionCode 1$/versionCode $VERSION_CODE/; s/versionName \"1.0\"/versionName \"$VERSION_NAME\"/" $APP/build.gradle
grep -n "versionCode\|versionName" $APP/build.gradle
echo "Android project ready"
