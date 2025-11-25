// src/modals/LossLogDeferredModal.ts

import { App, Modal, Setting, TextAreaComponent, Notice } from "obsidian";
import { LossLogService, PendingLossLogContext } from "../services/LossLogService"; // Import the service and the PendingLossLogContext interface
import { LossLogData, FailureType, DEFAULT_FAILURE_ARCHETYPES } from "../constants";

// This modal receives the richer PendingLossLogContext item from the queue and allows completion
export class LossLogDeferredModal extends Modal {
  private lossLogService: LossLogService;
  private pendingItem: PendingLossLogContext; // The item from the queue, now containing initial context and originalTaskId
  private indexInQueue: number; // Index of this item in the settings.lossLogPending array
  private onSubmit: () => void; // Callback to update the queue display in Mythos Hub

  // State variables to hold user input (same as LossLogModal)
  // These will be initialized from the pendingItem context
  private sourceTask: string = "";
  private failureType: FailureType | null = null;
  private selectedArchetypes: string[] = [];
  private impact: number = 1; // Default impact when deferred
  private syllabusTopics: string = ""; // Empty initially
  private syllabusPapers: string = ""; // Empty initially
  private aura: string = "#aura-mid"; // Default aura, can be overridden by initial context
  private emotionalState: string = "";
  private rootCauseChain: string[] = [""]; // Start with one empty field
  private ariadnesThread: string = ""; // Empty initially
  private counterFactual: string = ""; // Empty initially
  private evidenceLink: string = ""; // Empty initially
  private linkedMockTest: string = ""; // Empty initially

  constructor(
    app: App,
    lossLogService: LossLogService,
    pendingItem: PendingLossLogContext, // Receive the richer context item
    indexInQueue: number, // Receive its index
    onSubmit: () => void // Receive the callback
  ) {
    super(app);
    this.lossLogService = lossLogService;
    this.pendingItem = pendingItem;
    this.indexInQueue = indexInQueue;

    // Pre-populate state variables from the pending item context
    // This ensures the modal opens with the context captured earlier.
    this.sourceTask = pendingItem.sourceTask || "";
    this.failureType = pendingItem.initialFailureType || null; // Pre-select if available
    this.selectedArchetypes = [...(pendingItem.initialArchetypes || [])]; // Pre-fill selected archetypes (create a copy)
    this.aura = pendingItem.initialAura || "#aura-mid"; // Pre-select aura if available
    // Pre-populate other fields if the context provides them
    if (pendingItem.initialSyllabusTopics) {
      this.syllabusTopics = pendingItem.initialSyllabusTopics.join(", "); // Join array into string for input field
    }

    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("loss-log-deferred-modal");

    contentEl.createEl("h2", { text: "Complete Deferred Failure Log" });
    contentEl.createEl("p", { text: "Fill in the details for the failure you logged earlier.", cls: "modal-subtitle" });

    // --- Re-implement ALL the fields from LossLogModal.ts here ---
    // The user now fills in the detailed information, starting from the pre-filled context.

    // --- 1. Failure Triage (L1) - Pre-filled from context ---
    new Setting(contentEl)
      .setName("1. Failure Type")
      .setDesc("What type of failure was this?")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", "Select...")
          .addOption("Knowledge Gap", "Knowledge Gap (Didn't know)")
          .addOption("Skill Gap", "Skill Gap (Knew but couldn't apply)")
          .addOption("Process Failure", "Process Failure (Planning/Time/Execution)")
          .setValue(this.failureType || "") // Pre-select if available from context
          .onChange((value) => {
            this.failureType = value as FailureType;
          })
      );

    // --- 2. Failure Archetype Tagging (L3) - Pre-filled from context ---
    new Setting(contentEl)
      .setName("2. Failure Archetype(s)")
      .setDesc("Select one or more archetypes that describe the failure.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Select...");
        this.lossLogService.getFailureArchetypes().forEach((archetype) => {
          dropdown.addOption(archetype, archetype);
        });
        dropdown.onChange((value) => {
          if (value && !this.selectedArchetypes.includes(value)) {
            this.selectedArchetypes.push(value);
          }
        });
      });
    const archetypeDisplay = contentEl.createDiv({ cls: "selected-archetypes-display" });
    archetypeDisplay.setText(`Selected: ${this.selectedArchetypes.join(", ") || "None"}`);

    // --- 3. Impact Score (L4) - Default ---
    new Setting(contentEl)
      .setName("3. Impact Score")
      .setDesc("Rate the strategic impact of this failure (1 = Minor, 5 = Critical).")
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.impact)
          .onChange((value) => {
            this.impact = value;
          })
      );

    // --- 4. Source Task (Pre-filled from deferred item context) ---
    new Setting(contentEl)
      .setName("4. Source Task")
      .setDesc("What task or activity led to the failure?")
      .addText((text) =>
        text
          .setPlaceholder("e.g., Explain FRs vs DPSP in GS2")
          .setValue(this.sourceTask) // Pre-filled
          .onChange((value) => {
            this.sourceTask = value;
          })
      );

    // --- 5. Syllabus Topics & Papers ---
    new Setting(contentEl)
      .setName("5. Syllabus Topics")
      .setDesc("Link the relevant topic notes (comma-separated, e.g., [[Topic A]], [[Topic B]]).")
      .addText((text) =>
        text
          .setPlaceholder("[[Topic A]], [[Topic B]]")
          .setValue(this.syllabusTopics)
          .onChange((value) => {
            this.syllabusTopics = value;
          })
      );

    new Setting(contentEl)
      .setName("6. Syllabus Papers")
      .setDesc("Which UPSC paper(s) does this relate to? (comma-separated, e.g., #gs2, #essay)")
      .addText((text) =>
        text
          .setPlaceholder("#gs2, #essay")
          .setValue(this.syllabusPapers)
          .onChange((value) => {
            this.syllabusPapers = value;
          })
      );

    // --- 6. Aura & Emotional State (L5) - Pre-filled from context ---
    new Setting(contentEl)
      .setName("7. Energy & Emotion")
      .setDesc("Your energy level and emotional state during the failure.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("#aura-high", "High Energy")
          .addOption("#aura-mid", "Medium Energy")
          .addOption("#aura-low", "Low Energy")
          .setValue(this.aura) // Pre-select aura from context
          .onChange((value) => {
            this.aura = value;
          })
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", "Select Emotion...")
          .addOption("Frustrated", "Frustrated")
          .addOption("Anxious", "Anxious")
          .addOption("Tired", "Tired")
          .addOption("Distracted", "Distracted")
          .addOption("Overconfident", "Overconfident")
          .addOption("Confused", "Confused")
          .setValue(this.emotionalState)
          .onChange((value) => {
            this.emotionalState = value;
          })
      );

    // --- 7. Root Cause Chain (5 Whys) (L2) ---
    const causeSection = contentEl.createDiv({ cls: "root-cause-section" });
    causeSection.createEl("h4", { text: "8. Root Cause Analysis (5 Whys)" });
    causeSection.createEl("p", { text: "Ask 'Why?' repeatedly to find the core cause.", cls: "setting-item-description" });

    const causeInputsContainer = causeSection.createDiv({ cls: "cause-inputs-container" });

    const renderCauseInputs = () => {
      causeInputsContainer.empty();
      this.rootCauseChain.forEach((cause, index) => {
        new Setting(causeInputsContainer)
          .addText((text) =>
            text
              .setPlaceholder(`Why ${index + 1}? (e.g., Because I didn't revise...)`)
              .setValue(cause)
              .onChange((value) => {
                this.rootCauseChain[index] = value;
              })
          )
          .addExtraButton((button) =>
            button.setIcon("x").setTooltip("Remove this cause").onClick(() => {
              if (this.rootCauseChain.length > 1) {
                this.rootCauseChain.splice(index, 1);
                renderCauseInputs();
              } else {
                this.rootCauseChain[0] = "";
              }
            })
          );
      });

      if (this.rootCauseChain.length < 5) {
        new Setting(causeInputsContainer)
          .addButton((btn) =>
            btn.setButtonText("+ Add Why").onClick(() => {
              this.rootCauseChain.push("");
              renderCauseInputs();
            })
          );
      }
    };

    renderCauseInputs();

    // --- 8. Ariadne's Thread (L6) ---
    new Setting(contentEl)
      .setName("9. Ariadne's Thread")
      .setDesc("What reusable principle or action will prevent this type of failure in the future?")
      .addTextArea((textArea: TextAreaComponent) => {
        textArea
          .setPlaceholder("e.g., Always cross-check constitutional concepts with Laxmikanth before answering.")
          .setValue(this.ariadnesThread)
          .onChange((value) => {
            this.ariadnesThread = value;
          });
        textArea.inputEl.rows = 3;
      });

    // --- 9. Counter-Factual Prompt (L16) ---
    new Setting(contentEl)
      .setName("10. Counter-Factual")
      .setDesc("What single different action would have prevented this outcome?")
      .addTextArea((textArea: TextAreaComponent) => {
        textArea
          .setPlaceholder("e.g., Reviewed Laxmikanth Ch 6 before attempting.")
          .setValue(this.counterFactual)
          .onChange((value) => {
            this.counterFactual = value;
          });
        textArea.inputEl.rows = 2;
      });

    // --- 10. Evidence Attachment (L7) ---
    new Setting(contentEl)
      .setName("11. Evidence Link (Optional)")
      .setDesc("Link to an image, file, or specific note section showing the failure.")
      .addText((text) =>
        text
          .setPlaceholder("e.g., Screenshot Mock Q3.png or [[Source Note#^block-id]]")
          .setValue(this.evidenceLink)
          .onChange((value) => {
            this.evidenceLink = value;
          })
      );

    // --- 11. Linked Mock Test (L23) ---
    new Setting(contentEl)
      .setName("12. Linked Mock Test (Optional)")
      .setDesc("Link the mock test this failure occurred during (e.g., [[Mock Test 5 - GS2]]).")
      .addText((text) =>
        text
          .setPlaceholder("[[Mock Test Name]]")
          .setValue(this.linkedMockTest)
          .onChange((value) => {
            this.linkedMockTest = value;
          })
      );

    // --- Action Buttons ---
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
        btn.setButtonText("Remove from Queue").onClick(() => {
          // Remove the item from the pending queue in the service (and settings)
          this.lossLogService.removePendingLog(this.indexInQueue);
          this.onSubmit(); // Notify the hub to refresh
          this.close(); // Close the modal
        })
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      );
  }

private submitForm() {
    // Basic validation (same as LossLogModal)
    if (!this.failureType) {
      new Notice("Please select a Failure Type.");
      return;
    }
    if (this.selectedArchetypes.length === 0) {
      new Notice("Please select at least one Failure Archetype.");
      return;
    }
    if (!this.sourceTask.trim()) {
      new Notice("Please enter the Source Task.");
      return;
    }
    if (!this.ariadnesThread.trim()) {
      new Notice("Please define an Ariadne's Thread.");
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

    // Prepare the data object, using the filled-in state variables
    const lossData: LossLogData = {
      lossId: "", // Will be generated by the service
      sourceTask: this.sourceTask.trim(),
      failureType: this.failureType,
      failureArchetypes: this.selectedArchetypes,
      impact: this.impact,
      syllabusTopics: topicsArray,
      syllabusPapers: papersArray,
      aura: this.aura,
      emotionalState: this.emotionalState || undefined,
      rootCauseChain: this.rootCauseChain.filter((c) => c.trim() !== ""),
      ariadnesThread: this.ariadnesThread.trim(),
      counterFactual: this.counterFactual.trim() || undefined,
      evidenceLink: this.evidenceLink.trim() || undefined,
      linkedMockTest: this.linkedMockTest.trim() || undefined,
      timestamp: new Date().toISOString(), // Current time for the log creation
      // --- PASS SOURCE TASK ID FROM PENDING ITEM (L51, L85, L61) ---
      provenance: {
        origin: "deferred", // Mark as deferred log
        // Include the originalTaskId that was stored when the log was deferred
        sourceTaskId: this.pendingItem.originalTaskId, // Use the ID from the pending item context
      },
      // --- END PASS SOURCE TASK ID ---
    };

    // Call the service to create the log
    try {
      const preparedData = this.lossLogService.prepareLossLogData(lossData);
      this.lossLogService.createLossLog(preparedData).then(() => {
        // Remove the item from the pending queue *after* successful creation
        this.lossLogService.removePendingLog(this.indexInQueue);
        this.onSubmit(); // Notify the hub to refresh its queue display
        new Notice("Labyrinth: Deferred failure logged successfully.");
        // --- NEW: Show Escape Mechanic Notice (L25) ---
        this.lossLogService.showEscapeMechanicNotice();
        // --- END NEW ---
        this.close(); // Close the modal on success
      }).catch((error) => {
        console.error("Failed to submit deferred loss log:", error);
        new Notice("Failed to save deferred loss log. Please check console.");
      });
    } catch (error) {
      console.error("Error preparing or creating deferred loss log:", error);
      new Notice("An error occurred while preparing the log. Please check console.");
    }
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}