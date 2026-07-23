package com.custom.mdm.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log
import android.widget.Toast

class AppInstallStatusReceiver : BroadcastReceiver() {

    private val TAG = "AppInstallStatusReceiver"

    override fun onReceive(context: Context, intent: Intent) {
        val packageName = intent.getStringExtra("package_name") ?: "Unknown"
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "No details"
        val isUninstall = intent.action == "com.custom.mdm.UNINSTALL_COMPLETE"
        val opLabel = if (isUninstall) "Uninstall" else "Install"

        when (status) {
            PackageInstaller.STATUS_SUCCESS -> {
                Log.i(TAG, "Silent $opLabel succeeded for package: $packageName")
                Toast.makeText(context, "Successfully ${opLabel}ed: $packageName", Toast.LENGTH_SHORT).show()
            }
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                Log.w(TAG, "User action required (silent $opLabel bypassed): $packageName")
            }
            else -> {
                Log.e(TAG, "Silent $opLabel failed for $packageName: Status $status ($message)")
                Toast.makeText(context, "$opLabel Failed: $packageName ($message)", Toast.LENGTH_LONG).show()
            }
        }
    }
}
