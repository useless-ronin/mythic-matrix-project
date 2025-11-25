// src/commands.ts

import { TFile, Modal, Notice, Editor } from 'obsidian'; // Add Editor import
import MythicMatrixPlugin from './main';
import { LoomGenerationModal } from './modals/LoomGenerationModal';
import { WeaverLoomModal } from './modals/WeaverLoomModal';
import { LossLogModal } from './modals/LossLogModal'; // Import the LossLogModal
import { QuickLossLogModal } from './modals/QuickLossLogModal'; // Import the new modal


export function registerCommands(plugin: MythicMatrixPlugin) {
  // --- Core Weaver's Loom Commands ---

  plugin.addCommand({
    id: 'generate-weavers-loom-task',
    name: "Weaver's Loom: Generate Synthesis Task",
    callback: () => {
      const editor = plugin.app.workspace.activeEditor?.editor;
      if (!editor) {
        new Notice("No active editor to add task to.");
        return;
      }
      const taskText = `Synthesize [[Topic A]], [[Topic B]] (Loom Type: Triad)`;
      editor.replaceSelection(`- [ ] ${taskText}\n`);
    }
  });

  plugin.addCommand({
    id: 'loom-to-answer-pipeline',
    name: "Weaver's Loom: Draft Mains Answer from Synthesis",
    checkCallback: (checking: boolean) => {
      const activeFile = plugin.app.workspace.getActiveFile();
      const synthesisFolder = plugin.settings.synthesisNoteFolder || "50 Synthesis";
      if (activeFile && activeFile.path.startsWith(synthesisFolder)) {
        if (!checking) {
          plugin.createAnswerFromLoom(activeFile);
        }
        return true;
      }
      return false;
    }
  });

  plugin.addCommand({
    id: "pyq-to-loom",
    name: "Weaver's Loom: Generate Task from PYQ",
    callback: () => {
      const modal = new Modal(plugin.app);
      modal.contentEl.createEl("h3", { text: "Paste UPSC Question" });
      const textarea = modal.contentEl.createEl("textarea", { 
        attr: { placeholder: "e.g., 'Discuss the role of Governor...'" } 
      });
      const btn = modal.contentEl.createEl("button", { text: "Generate Loom Task" });
      btn.onclick = () => {
        const question = textarea.value.trim();
        if (!question) return;
        const keywords = question.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g) || ["Topic A", "Topic B"];
        const topics = keywords.slice(0, 3).map(k => `[[${k}]]`).join(", ");
        const taskText = `Synthesize ${topics} in light of: "${question.substring(0, 50)}..." (Loom Type: Triad)`;
        plugin.settings.tasks.push({ id: Date.now().toString(36), text: taskText, created: Date.now() });
        plugin.saveSettings();
        new Notice("PYQ loom task created");
        modal.close();
      };
      modal.open();
    }
  });

  plugin.addCommand({
    id: "reverse-loom-generator",
    name: "Weaver's Loom: Deconstruct Note into Loom Task",
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (file?.extension === "md") {
        if (!checking) {
          plugin.generateReverseLoomTask(file);
        }
        return true;
      }
      return false;
    }
  });

  plugin.addCommand({
    id: "weakest-link-loom",
    name: "Weaver's Loom: Generate Weakest Link Task",
    callback: () => {
      const allNotes = plugin.app.vault.getMarkdownFiles();
      let weakestTopic: string | null = null;
      let minConfidence = 5;
      
      for (const file of allNotes) {
        const cache = plugin.app.metadataCache.getFileCache(file);
        const confidence = cache?.frontmatter?.MyConfidence as number;
        if (confidence && confidence < minConfidence) {
          minConfidence = confidence;
          weakestTopic = file.basename;
        }
      }
      
      if (!weakestTopic) {
        new Notice("No low-confidence topics found.");
        return;
      }
      
      // 🔥 SAFE FILE ACCESS WITH TYPE GUARD
      const weakestFile = plugin.app.vault.getAbstractFileByPath(`${weakestTopic}.md`);
      if (!(weakestFile instanceof TFile)) {
        new Notice(`Could not find note for topic: ${weakestTopic}`);
        return;
      }
      
      const weakestCache = plugin.app.metadataCache.getFileCache(weakestFile);
      const syllabusTag = (weakestCache?.frontmatter?.tags as string[])?.find(t => /^#gs[1-4]$/.test(t));
      
      let strongTopic = "General";
      if (syllabusTag) {
        for (const file of allNotes) {
          const cache = plugin.app.metadataCache.getFileCache(file);
          const confidence = cache?.frontmatter?.MyConfidence as number;
          const tags = cache?.frontmatter?.tags as string[];
          if (confidence >= 4 && tags?.includes(syllabusTag)) {
            strongTopic = file.basename;
            break;
          }
        }
      }
      
      const taskText = `Bridge [[${weakestTopic}]] and [[${strongTopic}]] (Loom Type: Tension)`;
      plugin.settings.tasks.push({ id: Date.now().toString(36), text: taskText, created: Date.now() });
      plugin.saveSettings();
      new Notice(`Weakest link task created: ${weakestTopic} → ${strongTopic}`);
    }
  });

  plugin.addCommand({
    id: "upgrade-to-constellation",
    name: "Weaver's Loom: Upgrade to Constellation",
    checkCallback: (checking) => {
      const file = plugin.app.workspace.getActiveFile();
      if (file?.path.includes(plugin.settings.synthesisNoteFolder || "50 Synthesis")) {
        const cache = plugin.app.metadataCache.getFileCache(file);
        if (cache?.frontmatter?.loomType && cache.frontmatter.loomType !== "constellation") {
          if (!checking) {
            // Re-open as constellation
            const topics = (cache.frontmatter.loomTopics as string[]).map(t => t.replace(/\[\[|\]\]/g, ''));
            const taskText = `Map ${topics.join(', ')} across GS1-GS4 (Loom Type: Constellation)`;
            new WeaverLoomModal(plugin.app, 
              { loomType: "constellation", topics, originalTask: taskText, aura: undefined },
              plugin.synthesisService,
              plugin
            ).open();
          }
          return true;
        }
      }
      return false;
    }
  });

  // --- Labyrinth of Loss Commands ---

  plugin.addCommand({
    id: 'labyrinth-log-failure',
    name: 'Labyrinth: Log Failure',
    callback: () => {
      // Check if Labyrinth is enabled in settings
      if (plugin.settings.enableLabyrinth) {
        // Open the LossLogModal, passing the service and a callback if needed
        new LossLogModal(
          plugin.app,
          plugin.lossLogService,
          // Optional: A callback function to execute after successful submission
          (submittedData) => {
              console.log("Loss log submitted successfully:", submittedData);
              // Could emit an event, update UI, etc.
          }
        ).open();
      } else {
        new Notice("Labyrinth of Loss is not enabled in settings.");
      }
    }
  });

  // Example command to review the current Minotaur
  plugin.addCommand({
    id: 'labyrinth-review-minotaur',
    name: 'Labyrinth: Review Current Minotaur',
    callback: () => {
      if (plugin.settings.enableLabyrinth) {
        const currentMinotaur = plugin.settings.currentMinotaur;
        if (currentMinotaur) {
          new Notice(`Current Minotaur: ${currentMinotaur}`);
          // In the future, this could open the LabyrinthView directly to the Minotaur section
        } else {
          new Notice("No current Minotaur identified yet. Log some failures first.");
        }
      } else {
        new Notice("Labyrinth of Loss is not enabled in settings.");
      }
    }
  });

    plugin.addCommand({
    id: 'labyrinth-log-failure-from-context',
    name: 'Labyrinth: Log Failure from Context',
    // Use checkCallback to attempt to get context (e.g., selected text in editor)
    checkCallback: (checking: boolean) => {
      // Attempt to get the currently selected text in the active editor
      const editor = plugin.app.workspace.activeEditor?.editor;
      const selectedText = editor?.getSelection()?.trim();

      // Define the context we want to pass
      let contextSource = "";
      let initialContext = { sourceTask: "" };

      if (selectedText) {
        // If text is selected, use it as the source task
        contextSource = "selected text";
        initialContext.sourceTask = selectedText;
      } else {
        // If no text is selected, maybe use the filename of the active note as a fallback
        // Or check if the active note is a specific task note and extract its title/description
        const activeFile = plugin.app.workspace.getActiveFile();
        if (activeFile && activeFile.extension === "md") {
          contextSource = "active note";
          initialContext.sourceTask = activeFile.basename; // Use filename without extension
          // You could potentially read the file content here if the first line or frontmatter contains the task description
        }
      }

      // If we have *some* context (either selected text or active file name)
      if (initialContext.sourceTask) {
        if (!checking) {
          // Only proceed to open the modal if we are not just checking
          console.log(`[Commands] Labyrinth context from ${contextSource}: "${initialContext.sourceTask}"`);
          // Open the LossLogModal, passing the initial context
          new LossLogModal(
            plugin.app,
            plugin.lossLogService,
            // Optional: A callback function to execute after successful submission
            (submittedData) => {
                console.log("Loss log submitted successfully from context:", submittedData);
                // Could emit an event, update UI, etc.
            }
          ).open();

          // Pre-fill the source task field in the modal
          // Note: This requires modifying LossLogModal to accept initial context.
          // For now, the modal opens, and the user sees the context field ready to be edited.
          // A more advanced approach would involve passing the context via the constructor
          // or a dedicated method and updating the modal's state before opening.
          // Let's assume the LossLogModal has a method to set initial context.
          // This requires a minor update to LossLogModal.
        }
        return true; // Indicate that the command is available
      } else {
        // No context found, command is not available
        return false;
      }
    }
  });

  // Example command to process deferred logs (could be part of Mythos Hub)
  // This would typically be handled by the Mythos Hub view, but a command is possible.
  // plugin.addCommand({
  //   id: 'labyrinth-process-deferred',
  //   name: 'Labyrinth: Process Deferred Logs',
  //   callback: () => {
  //     // Logic to open a view or modal listing deferred logs using LossLogDeferredModal
  //     // This might require passing the plugin instance or a reference to the pending logs array
  //   }
  // });


  // --- NEW COMMAND: Quick Log Failure (L63) ---
  plugin.addCommand({
    id: 'labyrinth-quick-log-failure',
    name: 'Labyrinth: Quick Log Failure',
    callback: () => {
      // Check if Labyrinth is enabled in settings
      if (plugin.settings.enableLabyrinth) {
        // Open the QuickLossLogModal, passing the service and a callback if needed
        new QuickLossLogModal(
          plugin.app,
          plugin.lossLogService,
          // Optional: A callback function to execute after successful submission
          (submittedData) => {
              console.log("Quick loss log submitted successfully:", submittedData);
              // Could emit an event, update UI, etc.
          }
        ).open();
      } else {
        new Notice("Labyrinth of Loss is not enabled in settings.");
      }
    }
  });

  // --- NEW: Scrying Pool Command (L41) ---
  plugin.addCommand({
    id: 'labyrinth-scry-future-risk',
    name: 'Labyrinth: Log Future Risk (Scrying Pool)',
    callback: () => {
      // Check if Labyrinth is enabled in settings
      if (plugin.settings.enableLabyrinth) {
        // Open the LossLogModal in proactive mode
        new LossLogModal(
          plugin.app,
          plugin.lossLogService,
          // Optional: A callback function to execute after successful submission
          (submittedData) => {
              console.log("Scrying Pool log submitted successfully:", submittedData);
              // Could emit an event, update UI, etc.
          },
          // Pass the initial context object, setting isProactiveMode to true
          { isProactiveMode: true }
        ).open();
      } else {
        new Notice("Labyrinth of Loss is not enabled in settings.");
      }
    }
  });

  // --- NEW: Command to Run Thread Obsolescence Check (L90) ---
  plugin.addCommand({
    id: 'labyrinth-run-thread-obsolescence-check',
    name: 'Labyrinth: Run Thread Obsolescence Check',
    callback: async () => {
      if (plugin.settings.enableLabyrinth) {
        console.log("[Commands] Executing Thread Obsolescence Check (L90) command...");
        try {
          await plugin.lossLogService.checkThreadObsolescence(); // Call the new method on the service
          new Notice("Labyrinth: Thread Obsolescence Check completed.");
        } catch (error) {
          console.error("[Commands] Error running Thread Obsolescence Check (L90):", error);
          new Notice("Labyrinth: Error running Thread Obsolescence Check. Check console.");
        }
      } else {
        new Notice("Labyrinth of Loss is not enabled in settings.");
      }
    }
  });
  // --- END NEW COMMAND ---

  // --- NEW: Weekly Reset Command ---
  plugin.addCommand({
    id: 'mythic-matrix-weekly-reset',
    name: 'Mythic Matrix: Weekly Reset',
    callback: () => {
      // Emit the weeklyReset event, which will be caught by the main plugin class
      plugin.eventBus.emit('weeklyReset');
      new Notice("Mythic Matrix: Weekly reset initiated.");
    }
  });
  // --- END NEW ---

  // --- View Commands ---

  plugin.addCommand({ id: 'open-mythic-matrix', name: 'Open Mythic Matrix', callback: () => plugin.activateView('priority-matrix-view') });
  plugin.addCommand({ id: 'open-phoenix-nest', name: 'Open Phoenix Nest', callback: () => plugin.activateView('phoenix-nest-view') });
  plugin.addCommand({ id: 'open-mythos-hub', name: 'Open Mythos Hub', callback: () => plugin.activateView('mythos-hub-view') });
  plugin.addCommand({ id: 'open-alchemist-log', name: 'Open Alchemist\'s Log', callback: () => plugin.activateView('alchemist-log-view') });
  plugin.addCommand({ id: 'open-weavers-loom', name: "Open Weaver's Loom", callback: () => plugin.activateView('weaver-loom-view') });
  plugin.addCommand({ id: 'open-labyrinth-view', name: 'Open Labyrinth of Loss', callback: () => plugin.activateView('labyrinth-view') });

  

  // --- Ribbon Icons (still registered here) ---

  plugin.addRibbonIcon('layout-grid', 'Open Mythic Matrix', () => {
    plugin.activateView('priority-matrix-view');
  });

  plugin.addRibbonIcon('combine', "Open Weaver's Loom", () => {
    plugin.activateView('weaver-loom-view');
  });

  plugin.addRibbonIcon('combine', "Weaver's Loom from Note", () => {
    const file = plugin.app.workspace.getActiveFile();
    if (!file) return;
    new LoomGenerationModal(plugin.app, (taskText: string) => {
      plugin.settings.tasks.push({
        id: Date.now().toString(36),
        text: taskText,
        created: Date.now()
      });
      plugin.saveSettings();
      plugin.rerenderMatrixView();
    }).setInitialTopic(file.basename);
  });

  // --- Labyrinth Ribbon Icon (Optional) ---
  // plugin.addRibbonIcon('tombstone', "Enter the Labyrinth", () => {
  //   // Could open the main Labyrinth view or the log modal
  //   plugin.app.commands.executeCommandById('mythic-matrix:labyrinth-log-failure');
  // });
}