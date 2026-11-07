# Grabador NFC (app Android interna)

Configura los chips NTAG 424 DNA de las mesas con un toque: enlace de la mesa, SUN (e y c),
llaves 1 y 2 del restaurante, llave maestra derivada y vinculación a la mesa. No va a la Play
Store: se instala a mano.

- Es una cáscara de Capacitor que carga el panel publicado (`server.url` en
  `capacitor.config.json`, `https://tabi-app.sodet.co/admin/grabador-nfc`). La página es
  `apps/app/src/app/admin/grabador-nfc` (lista de restaurantes → mesas → tocar el chip) y la lógica del chip, en TypeScript, está en
  `apps/app/src/lib/ntag424` (pruebas: `npm test -w @tabi/app`, con los vectores de NXP AN12196).
- Lo único nativo es `NfcApduPlugin.java`: esperar un chip (UID), mandar APDUs por IsoDep, soltarlo.
- Las llaves salen de la base (`nfc_iniciar_grabacion`) y la verificación final la hace
  `nfc_confirmar_grabacion` (migración `20261105000000_grabador_nfc.sql`).

## Compilar el APK

Con Android Studio instalado (usa su Java 21):

```
cd apps/grabador-nfc
npx cap sync android
cd android
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
gradlew.bat assembleDebug
```

Sale en `android/app/build/outputs/apk/debug/app-debug.apk`. Se pasa al celular y se instala
(hay que permitir "instalar apps desconocidas").

iOS queda para después: Core NFC permite APDUs (`NFCISO7816Tag`) declarando los AID
`D2760000850101` y `D2760000850100` en Info.plist; la parte TypeScript sirve igual.
