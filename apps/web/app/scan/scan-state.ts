import type { ScanAction, ScanState } from "./types";

export const initialScanState: ScanState = {
  status: "idle",
  selectedFile: null,
  portionHint: "",
  result: null,
  error: null,
};

function getReadyStatus(selectedFile: File | null): ScanState["status"] {
  return selectedFile ? "image_selected" : "idle";
}

export function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case "SELECT_IMAGE":
      return {
        ...state,
        status: "image_selected",
        selectedFile: action.file,
        result: null,
        error: null,
      };
    case "REMOVE_IMAGE":
      return {
        ...state,
        status: "idle",
        selectedFile: null,
        result: null,
        error: null,
      };
    case "SET_PORTION_HINT":
      return {
        ...state,
        portionHint: action.value,
        error: null,
        status: state.status === "error" ? getReadyStatus(state.selectedFile) : state.status,
      };
    case "START_ANALYSIS":
      if (!state.selectedFile) {
        return {
          ...state,
          status: "error",
          error: "Please take or upload a meal photo before analyzing.",
        };
      }
      return {
        ...state,
        status: "analyzing",
        result: null,
        error: null,
      };
    case "ANALYSIS_SUCCESS":
      return {
        ...state,
        status: "confirming",
        result: action.result,
        error: null,
      };
    case "LOAD_RESULT":
      return {
        ...state,
        status: "confirming",
        selectedFile: null,
        result: action.result,
        error: null,
      };
    case "MEAL_CONFIRMED":
      return {
        ...state,
        status: "confirmed",
        error: null,
      };
    case "ANALYSIS_ERROR":
      return {
        ...state,
        status: "error",
        result: null,
        error: action.message,
      };
    case "SET_ERROR":
      return {
        ...state,
        status: "error",
        result: null,
        error: action.message,
      };
    case "CLEAR_ERROR":
      return {
        ...state,
        status: getReadyStatus(state.selectedFile),
        error: null,
      };
    case "RESET_FLOW":
      return {
        ...initialScanState,
      };
    default:
      return state;
  }
}
