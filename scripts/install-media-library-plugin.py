#!/usr/bin/env python3
import json
import pathlib
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
config = json.loads((ROOT / "capacitor.config.json").read_text())
package = config["appId"]
java_dir = ROOT / "android" / "app" / "src" / "main" / "java" / pathlib.Path(*package.split("."))
java_dir.mkdir(parents=True, exist_ok=True)

main_activity = f"""package {package};

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {{
    @Override
    public void onCreate(Bundle savedInstanceState) {{
        registerPlugin(MediaLibraryPlugin.class);
        super.onCreate(savedInstanceState);
    }}
}}
"""
(java_dir / "MainActivity.java").write_text(main_activity)

plugin = r'''package PACKAGE_NAME;

import android.Manifest;
import android.content.ContentUris;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;

@CapacitorPlugin(
    name = "MediaLibrary",
    permissions = {
        @Permission(alias = "videos", strings = { Manifest.permission.READ_MEDIA_VIDEO }),
        @Permission(alias = "selectedVideos", strings = { Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED }),
        @Permission(alias = "legacyVideos", strings = { Manifest.permission.READ_EXTERNAL_STORAGE })
    }
)
public class MediaLibraryPlugin extends Plugin {
    @PluginMethod
    public void listVideos(PluginCall call) {
        if (hasVideoPermission()) {
            queryVideos(call);
            return;
        }
        if (Build.VERSION.SDK_INT >= 34) {
            requestPermissionForAliases(new String[]{"videos", "selectedVideos"}, call, "videoPermissionResult");
        } else if (Build.VERSION.SDK_INT >= 33) {
            requestPermissionForAlias("videos", call, "videoPermissionResult");
        } else {
            requestPermissionForAlias("legacyVideos", call, "videoPermissionResult");
        }
    }

    @PermissionCallback
    private void videoPermissionResult(PluginCall call) {
        if (!hasVideoPermission()) {
            call.reject("Video permission was not granted. Allow video access and try again.");
            return;
        }
        queryVideos(call);
    }

    private boolean hasVideoPermission() {
        if (Build.VERSION.SDK_INT >= 34) {
            return getPermissionState("videos") == PermissionState.GRANTED
                || getPermissionState("selectedVideos") == PermissionState.GRANTED;
        }
        if (Build.VERSION.SDK_INT >= 33) {
            return getPermissionState("videos") == PermissionState.GRANTED;
        }
        return getPermissionState("legacyVideos") == PermissionState.GRANTED;
    }

    private void queryVideos(PluginCall call) {
        JSArray videos = new JSArray();
        String[] projection = {
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME,
            MediaStore.Video.Media.SIZE,
            MediaStore.Video.Media.DATE_ADDED,
            MediaStore.Video.Media.DURATION,
            MediaStore.Video.Media.DATA,
            MediaStore.Video.Media.MIME_TYPE,
            MediaStore.Video.Media.RELATIVE_PATH
        };
        String order = MediaStore.Video.Media.DATE_ADDED + " DESC";
        try (Cursor cursor = getContext().getContentResolver().query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                projection, null, null, order)) {
            if (cursor != null) {
                int idCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID);
                int nameCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DISPLAY_NAME);
                int sizeCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.SIZE);
                int dateCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATE_ADDED);
                int durationCol = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DURATION);
                int dataCol = cursor.getColumnIndex(MediaStore.Video.Media.DATA);
                int mimeCol = cursor.getColumnIndex(MediaStore.Video.Media.MIME_TYPE);
                int folderCol = cursor.getColumnIndex(MediaStore.Video.Media.RELATIVE_PATH);
                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idCol);
                    Uri uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, id);
                    JSObject item = new JSObject();
                    item.put("id", String.valueOf(id));
                    item.put("name", cursor.getString(nameCol));
                    item.put("size", cursor.getLong(sizeCol));
                    item.put("dateAdded", cursor.getLong(dateCol));
                    item.put("duration", cursor.getLong(durationCol));
                    item.put("contentUri", uri.toString());
                    String path = dataCol >= 0 ? cursor.getString(dataCol) : null;
                    if (path != null && !path.isEmpty()) item.put("path", path);
                    if (mimeCol >= 0) item.put("mimeType", cursor.getString(mimeCol));
                    if (folderCol >= 0) item.put("folder", cursor.getString(folderCol));
                    videos.put(item);
                }
            }
            JSObject result = new JSObject();
            result.put("videos", videos);
            result.put("count", videos.length());
            result.put("access", getPermissionState(Build.VERSION.SDK_INT >= 33 ? "videos" : "legacyVideos").toString());
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("Could not scan videos on this device: " + ex.getMessage(), ex);
        }
    }

    @PluginMethod
    public void getVideoThumbnail(PluginCall call) {
        String id = call.getString("id");
        if (id == null || id.isEmpty()) {
            call.reject("A video ID is required.");
            return;
        }
        try {
            Uri uri = ContentUris.withAppendedId(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, Long.parseLong(id));
            Bitmap bitmap;
            if (Build.VERSION.SDK_INT >= 29) {
                bitmap = getContext().getContentResolver().loadThumbnail(uri, new Size(320, 180), null);
            } else {
                bitmap = MediaStore.Video.Thumbnails.getThumbnail(
                    getContext().getContentResolver(), Long.parseLong(id),
                    MediaStore.Video.Thumbnails.MINI_KIND, null);
            }
            if (bitmap == null) {
                call.reject("Thumbnail is unavailable.");
                return;
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, 68, output);
            bitmap.recycle();
            JSObject result = new JSObject();
            result.put("thumbnail", Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            call.resolve(result);
        } catch (Exception ex) {
            call.reject("Could not load video thumbnail: " + ex.getMessage(), ex);
        }
    }
}
'''.replace("PACKAGE_NAME", package)
(java_dir / "MediaLibraryPlugin.java").write_text(plugin)

manifest_path = ROOT / "android" / "app" / "src" / "main" / "AndroidManifest.xml"
tree = ET.parse(manifest_path)
root = tree.getroot()
android = "{http://schemas.android.com/apk/res/android}"
existing = {node.get(android + "name") for node in root.findall("uses-permission")}
for name in (
    "android.permission.READ_MEDIA_VIDEO",
    "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
):
    if name not in existing:
        node = ET.Element("uses-permission")
        node.set(android + "name", name)
        root.insert(0, node)
if "android.permission.READ_EXTERNAL_STORAGE" not in existing:
    node = ET.Element("uses-permission")
    node.set(android + "name", "android.permission.READ_EXTERNAL_STORAGE")
    node.set(android + "maxSdkVersion", "32")
    root.insert(0, node)
ET.indent(tree, space="    ")
tree.write(manifest_path, encoding="utf-8", xml_declaration=True)
print("Installed MediaStore video scanner plugin and Android media permissions.")
