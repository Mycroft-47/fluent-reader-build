import { contextBridge } from "electron"
import settingsBridge from "./bridges/settings"
import utilsBridge from "./bridges/utils"

// --- CRITICAL FIX: Expose the system resource path directly ---
// In an AppImage, this is /tmp/.mount_XXX/resources
contextBridge.exposeInMainWorld("RESOURCES_PATH", process.resourcesPath)
// -------------------------------------------------------------

contextBridge.exposeInMainWorld("settings", settingsBridge)
contextBridge.exposeInMainWorld("utils", utilsBridge)