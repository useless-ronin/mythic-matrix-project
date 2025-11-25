// src/modals/QuickLossLogModal.ts

import { App, Modal, Setting, TextAreaComponent, Notice } from "obsidian";
import { LossLogService } from "../services/LossLogService";
import { LossLogData, FailureType } from "../constants";

// --- UPDATE: Ensure sourceTaskId is included in the interface ---
interface InitialQuickLogContext {
  sourceTask?: string; // Could be used to infer initial fields if needed, though not directly shown
  initialFailureType?: FailureType;
  initialArchetype?: string;
  initialSyllabusTopics?: string[]; // Example of an additional field
  // --- INCLUDE FIELD FOR ORIGINAL SOURCE TASK ID (L51, L24, L85) ---
  sourceTaskId?: string; // Could be a Crucible task ID or a file path for auto-tagging
  // --- END INCLUDE ---
  // --- INCLUDE FIELD FOR PROACTIVE MODE (L41) ---
  isProactiveMode?: boolean; // Flag to indicate if opened from proactive context
  // --- END INCLUDE ---
}

export class QuickLossLogModal extends Modal {
  private lossLogService: LossLogService;
  private onSubmit: ( data: LossLogData) => void;
  private initialContext?: InitialQuickLogContext; // Store the initial context provided by the caller

  // State variables (as before)
  private sourceTask: string = "";
  private failureType: FailureType | null = null;
  private selectedArchetype: string = ""; // Singular for quick log
  private impact: number = 1; // Default impact for quick log
  private syllabusTopics: string = "";
  private syllabusPapers: string = "";
  private aura: string = "#aura-mid";
  private emotionalState: string = "";
  private quickCause: string = ""; // Single field for quick root cause
  private ariadnesThread: string = ""; // Single field for quick thread
  private counterFactual: string = "";
  private evidenceLink: string = "";
  private linkedMockTest: string = "";

  constructor(app: App, lossLogService: LossLogService, onSubmit: ( data: LossLogData) => void, initialContext?: InitialQuickLogContext) {
    super(app);
    this.lossLogService = lossLogService;
    this.onSubmit = onSubmit;
    this.initialContext = initialContext;

    // Pre-populate state variables from initialContext if provided (e.g., from FeedbackModal prompt)
    if (this.initialContext?.sourceTask) {
      this.sourceTask = this.initialContext.sourceTask;
    }
    if (this.initialContext?.initialFailureType) {
      this.failureType = this.initialContext.initialFailureType;
    }
    if (this.initialContext?.initialArchetype) {
      this.selectedArchetype = this.initialContext.initialArchetype; // Single archetype for quick log
    }
    // Note: initialAura was removed from interface and constructor usage in a previous step
    if (this.initialContext?.initialSyllabusTopics) {
      this.syllabusTopics = this.initialContext.initialSyllabusTopics.join(", "); // Join array into string for input field
    }
    // Pre-populate other fields if initialContext provides them
    // e.g., if (this.initialContext?.isProactiveMode) { this.isProactiveMode = this.initialContext.isProactiveMode; }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("quick-loss-log-modal"); // Add a class for potential custom styling

    contentEl.createEl("h2", { text: "Quick Loss Log" });
    contentEl.createEl("p", { text: "Capture the essence quickly.", cls: "modal-subtitle" });

    // --- 1. Failure Archetype (L3) ---
    new Setting(contentEl)
      .setName("1. Failure Archetype")
      .setDesc("Select the primary type of failure.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select...");
        this.lossLogService.getFailureArchetypes().forEach((archetype) => {
          dropdown.addOption(archetype, archetype);
        });
        dropdown.setValue(this.selectedArchetype); // Pre-select if available from context
        dropdown.onChange((value) => {
          this.selectedArchetype = value;
        });
      });

    // --- 2. 1-Sentence Cause ---
    new Setting(contentEl)
      .setName("2. 1-Sentence Cause")
      .setDesc("What went wrong in one sentence?")
      .addTextArea((textArea: TextAreaComponent) => {
        textArea
          .setPlaceholder("e.g., I confused FRs and DPSP due to faded knowledge.")
          .setValue(this.quickCause)
          .onChange((value) => {
            this.quickCause = value;
          });
        textArea.inputEl.rows = 2; // Keep it short
      });

    // --- 3. 1-Sentence Thread (L6) ---
    new Setting(contentEl)
      .setName("3. 1-Sentence Thread")
      .setDesc("What principle prevents this in the future?")
      .addTextArea((textArea: TextAreaComponent) => {
        textArea
          .setPlaceholder("e.g., Always cross-check constitutional concepts with Laxmikanth.")
          .setValue(this.ariadnesThread)
          .onChange((value) => {
            this.ariadnesThread = value;
          });
        textArea.inputEl.rows = 2; // Keep it short
      });

    // --- Submit Buttons ---
    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Log Failure")
          .setCta()
          .onClick(() => {
            this.submitForm();
          })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      );
  }

  private submitForm() {
    // Basic validation for required fields
    if (!this.selectedArchetype) { // Check singular archetype
      new Notice("Please select a Failure Archetype.");
      return;
    }
    if (!this.quickCause.trim()) { // Check quick cause field
      new Notice("Please enter the 1-sentence cause.");
      return;
    }
    if (!this.ariadnesThread.trim()) { // Check ariadnes thread field
      new Notice("Please define the 1-sentence thread.");
      return;
    }

    // Process comma-separated strings into arrays
    const topicsArray = this.syllabusTopics
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    const papersArray = this.syllabusPapers
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Prepare the data object with minimal required fields
    // Other fields will get defaults from prepareLossLogData
    const lossData: LossLogData = {
      lossId: "", // Will be generated by the service
      sourceTask: `Quick Log: ${this.selectedArchetype}`, // Generate a basic source task
      failureType: "Knowledge Gap", // Default for quick log, user can refine later if needed
      failureArchetypes: [this.selectedArchetype], // Use the selected archetype as a single-item array
      impact: this.impact,
      syllabusTopics: topicsArray, // Use the processed array
      syllabusPapers: papersArray, // Use the processed array
      aura: this.aura,
      emotionalState: this.emotionalState || undefined,
      rootCauseChain: [this.quickCause.trim()], // Use the quick cause as the first root cause in an array
      ariadnesThread: this.ariadnesThread.trim(), // Use the quick thread
      counterFactual: this.counterFactual.trim() || undefined,
      evidenceLink: this.evidenceLink.trim() || undefined,
      linkedMockTest: this.linkedMockTest.trim() || undefined,
      timestamp: new Date().toISOString(), // Set current time
      // --- UPDATED: Include originalTaskId in provenance (L51, L85, L24) ---
      provenance: {
        origin: this.initialContext?.isProactiveMode ? "scrying-pool-quick" : "quick-log", // Mark as quick log origin, differentiate proactive
        // Include the sourceTaskId from the initial context if it was provided
        // This is crucial for L51 (auto-tagging) and L85/L24 (tracking original task)
        sourceTaskId: this.initialContext?.sourceTaskId, // Pass the Crucible task ID or file path
      },
      // --- END UPDATED ---
    };

    // Call the service to create the log
    try {
      // Use the service's helper to prepare the data (fills ID, defaults)
      const preparedData = this.lossLogService.prepareLossLogData(lossData);
      // Pass the prepared data to the service's creation method
      this.lossLogService.createLossLog(preparedData).then(() => {
        // Optionally call the onSubmit callback if you need to update parent state
        if (this.onSubmit) {
            this.onSubmit(preparedData);
        }
        new Notice("Labyrinth: Quick failure logged successfully.");
        // --- NEW: Show Escape Mechanic Notice (L25) ---
        this.lossLogService.showEscapeMechanicNotice();
        // --- END NEW ---
        this.close(); // Close the modal on success
      }).catch((error) => {
        console.error("Failed to submit quick loss log:", error);
        new Notice("Failed to save quick loss log. Please check console.");
      });
    } catch (error) {
      console.error("Error preparing or creating quick loss log:", error);
      new Notice("An error occurred while preparing the quick log. Please check console.");
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}