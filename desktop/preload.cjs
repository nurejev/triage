"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const initialTheme = process.argv
  .find((arg) => arg.startsWith("--triage-theme="))
  ?.slice("--triage-theme=".length);
contextBridge.exposeInMainWorld("triageNative", {
  responseConnect: (value) =>
    ipcRenderer.invoke("triage:response-connect", value),
  responseRequest: (value) =>
    ipcRenderer.invoke("triage:response-request", value),
  profiles: () => ipcRenderer.invoke("triage:profiles"),
  chooseCertificate: () => ipcRenderer.invoke("triage:choose-certificate"),
  saveProfile: (input) => ipcRenderer.invoke("triage:save-profile", input),
  updateProfile: (input) => ipcRenderer.invoke("triage:update-profile", input),
  removeProfile: (id) => ipcRenderer.invoke("triage:remove-profile", id),
  importProfile: () => ipcRenderer.invoke("triage:import-profile"),
  registrationKit: (input) =>
    ipcRenderer.invoke("triage:registration-kit", input),
  initialTheme: ["system", "light", "dark"].includes(initialTheme)
    ? initialTheme
    : "system",
  setTheme: (value) => ipcRenderer.invoke("triage:set-theme", value),
  evidenceFolder: () => ipcRenderer.invoke("triage:evidence-folder"),
  chooseEvidenceFolder: () =>
    ipcRenderer.invoke("triage:choose-evidence-folder"),
  openEvidenceFolder: () => ipcRenderer.invoke("triage:open-evidence-folder"),
  saveCase: (bundle) => ipcRenderer.invoke("triage:save-case", bundle),
  loadCase: (caseId) => ipcRenderer.invoke("triage:load-case", caseId),
  listCases: () => ipcRenderer.invoke("triage:list-cases"),
  clearCase: (caseId) => ipcRenderer.invoke("triage:clear-case", caseId),
  preflight: () => ipcRenderer.invoke("triage:preflight"),
  disconnect: () => ipcRenderer.invoke("triage:disconnect"),
  connect: (input) => ipcRenderer.invoke("triage:connect", input),
  cancelConnect: (input) => ipcRenderer.invoke("triage:cancel-connect", input),
  sessions: () => ipcRenderer.invoke("triage:sessions"),
  collect: (plan) => ipcRenderer.invoke("triage:collect", plan),
  cancel: () => ipcRenderer.invoke("triage:cancel"),
  openBrowser: (bundle) => ipcRenderer.invoke("triage:browser", bundle),
  onProgress: (callback) => {
    ipcRenderer.on("triage:progress", (_event, value) => callback(value));
  },
  onPlan: (callback) => {
    ipcRenderer.on("triage:plan", (_event, value) => callback(value));
  },
});
