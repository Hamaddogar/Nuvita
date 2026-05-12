export type DetectedFood = {
  name: string;
  quantity_estimate: string | null;
  estimated_grams: number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  usda_match?: {
    fdc_id: string | number;
    description: string;
  } | null;
};

export type AnalyzeImageResponse = {
  success: boolean;
  detected_foods: DetectedFood[];
  total: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
  notes: string[];
};

export type ScanStatus = "idle" | "image_selected" | "analyzing" | "success" | "error";

export type ScanState = {
  status: ScanStatus;
  selectedFile: File | null;
  portionHint: string;
  result: AnalyzeImageResponse | null;
  error: string | null;
};

export type ScanAction =
  | {
      type: "SELECT_IMAGE";
      file: File;
    }
  | {
      type: "REMOVE_IMAGE";
    }
  | {
      type: "SET_PORTION_HINT";
      value: string;
    }
  | {
      type: "START_ANALYSIS";
    }
  | {
      type: "ANALYSIS_SUCCESS";
      result: AnalyzeImageResponse;
    }
  | {
      type: "ANALYSIS_ERROR";
      message: string;
    }
  | {
      type: "SET_ERROR";
      message: string;
    }
  | {
      type: "CLEAR_ERROR";
    };
