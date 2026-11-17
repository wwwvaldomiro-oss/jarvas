export { FleetModule } from './FleetModule';
export { FuelingForm, fuelingFormSchema, type FuelingFormProps, type FuelingFormValues } from './components/FuelingForm';
export { FleetProvider, useFleet } from './context/FleetContext';
export { LocalStorageFleetAdapter, RemoteApiFleetAdapter } from './services/fleet.adapter';
export { createSeedSnapshot } from './services/fleet.seed';
export {
  parseReceiptImageWithGemini,
  type ParsedReceiptResult,
  type ReceiptEntryKind,
} from './services/receipt-ocr.service';
export {
  consultPlateCompliance,
  parseDocumentImageWithGemini,
  type GeminiDocumentKind,
  type ParsedDocumentResult,
  type PlateConsultationResponse,
} from './services/document-compliance.service';
export * from './types/fleet.types';
export * from './schemas/fleet.schemas';
export * from './utils/fleet.calculations';
export {
  generateFleetReportPdf,
  downloadFleetReportPdf,
  generateFiciPdf,
  downloadFiciPdf,
} from './utils/fleet.pdf';
export { GIT_SUBTREE_COMMANDS, TANSTACK_BRIDGE_SNIPPET } from './integration/tanstack-start-bridge';
