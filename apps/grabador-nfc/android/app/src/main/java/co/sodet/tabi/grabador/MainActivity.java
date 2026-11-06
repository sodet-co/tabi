package co.sodet.tabi.grabador;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins locales se registran antes de crear el puente.
        registerPlugin(NfcApduPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
