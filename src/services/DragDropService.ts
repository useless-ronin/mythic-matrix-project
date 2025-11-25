// src/services/DragDropService.ts
import { App, TFile } from 'obsidian';

export class DragDropService {
    constructor(private app: App) {}

    /**
     * Attempts to resolve a file from a drag event's DataTransfer object.
     * Handles Obsidian URIs, direct paths, and basename fallbacks.
     * @param dataTransfer The DataTransfer object from the drag event.
     * @returns A Promise resolving to the TFile if found, otherwise null.
     */
    async getDroppedFile(dataTransfer: DataTransfer | null): Promise<TFile | null> {
        let rawPath = dataTransfer?.getData("text/plain");
        if (!rawPath) {
            // console.warn("[DragDropService] No data found in drag event."); // Removed log
            return null;
        }

        let pathToLookup = rawPath;

        // 1. Handle Obsidian URI
        if (rawPath.startsWith('obsidian://open?')) {
            try {
                const url = new URL(rawPath);
                const filePath = url.searchParams.get('file');
                if (filePath) {
                    pathToLookup = decodeURIComponent(filePath);
                    // console.log("[DragDropService] Decoded URI path:", pathToLookup); // Removed log
                } else {
                    // console.warn("[DragDropService] Obsidian URI did not contain a 'file' parameter."); // Removed log
                    return null;
                }
            } catch (error) {
                // console.error("[DragDropService] Could not parse Obsidian URI:", error); // Removed log
                return null;
            }
        } // else {
             // console.log("[DragDropService] Using raw path directly:", pathToLookup); // Removed log
        // }

        // Ensure the path has the correct extension for lookup
        if (!pathToLookup.endsWith('.md')) {
            pathToLookup += '.md';
            // console.log("[DragDropService] Appended .md extension, lookup path:", pathToLookup); // Removed log
        }

        // 2. Attempt lookup by the resolved path (handles files in folders)
        let file = this.app.vault.getAbstractFileByPath(pathToLookup);
        // console.log("[DragDropService] Path lookup result for '", pathToLookup, "':", file); // Removed log

        if (file instanceof TFile) {
            // console.log("[DragDropService] Found file by path:", file.path); // Removed log
            return file; // Found by full path
        }

        // 3. If path lookup failed and the *original* raw data doesn't contain '/', try basename fallback
        // The raw data (before URI decode/appending .md) is the key for basename check
        const originalRawPathForBasename = rawPath.replace(/\.md$/, ''); // Remove .md if present in raw data for basename check
        // console.log("[DragDropService] Original raw path for basename check (without .md):", originalRawPathForBasename); // Removed log
        // console.log("[DragDropService] Does original raw path contain '/':", rawPath.includes('/')); // Removed log

        if (!rawPath.includes('/')) {
            // console.log("[DragDropService] Attempting basename fallback for:", originalRawPathForBasename); // Removed log
            // Use 'find' which can return 'undefined', then explicitly assign to 'file' which can be 'null'
            const foundFile = this.app.vault.getMarkdownFiles().find(f => f.basename === originalRawPathForBasename);
            // console.log("[DragDropService] Basename lookup result for '", originalRawPathForBasename, "':", foundFile); // Removed log
            file = foundFile || null; // Assign the found file or null
            if (file instanceof TFile) {
                 // console.log("[DragDropService] Found file by basename:", file.path); // Removed log
                 return file; // Found by basename
            }
        } // else {
             // console.log("[DragDropService] Skipping basename fallback, raw path contains '/'."); // Removed log
        // }

        // 4. If both path and basename lookups failed
        // console.warn(`[DragDropService] File not found using path: "${pathToLookup}" or basename: "${originalRawPathForBasename}".`); // Removed log
        return null;
    }
}