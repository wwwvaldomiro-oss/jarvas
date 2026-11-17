export type FuelType = 'GASOLINA' | 'ETANOL' | 'DIESEL' | 'GNV' | 'ELETRICO' | 'FLEX';
export type VehicleStatus = 'ATIVO' | 'MANUTENCAO' | 'INATIVO';
export type MaintenanceType = 'PREVENTIVA' | 'CORRETIVA';
export type MaintenanceStatus = 'ABERTA' | 'EM_EXECUCAO' | 'CONCLUIDA';
export type LedgerKind = 'DESPESA' | 'RECEITA';
export type FineStatus = 'PENDENTE' | 'INDICADO' | 'PAGA' | 'RECORRIDA';
export type DocumentType = 'CRLV' | 'IPVA' | 'SEGURO' | 'VISTORIA';
export type DocumentStatus = 'PENDENTE' | 'PAGO' | 'ISENTO';

export type FleetTab =
  | 'dashboard'
  | 'veiculos'
  | 'documentos'
  | 'lancamentos'
  | 'checklists'
  | 'percursos';

export interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number;
  fuelType: FuelType;
  currentOdometer: number;
  status: VehicleStatus;
  assignedDriverId?: string | undefined;
  renavam?: string | undefined;
  chassis?: string | undefined;
  stateUf?: string | undefined;
  tankCapacityLiters?: number | undefined;
  fipeValue?: number | undefined; // Valor de mercado FIPE para cálculo de depreciação e TCO
  monthlyFixedCost?: number | undefined; // Custo fixo mensal rateado (seguro, IPVA, financiamento)
  notes?: string | undefined;
  createdAt: string;
}

export interface Driver {
  id: string;
  userId: string; // Vínculo com o usuário do app principal (Órion / Conecta)
  name: string;
  cnhNumber: string;
  cnhCategory: string;
  cnhExpiry: string; // ISO YYYY-MM-DD
  phone?: string | undefined;
  allowedVehicleIds: string[];
  active: boolean;
}

export interface FuelingRecord {
  id: string;
  vehicleId: string;
  driverId: string;
  date: string; // ISO YYYY-MM-DD
  odometer: number;
  fuelType: FuelType;
  quantity: number; // Litros ou kWh
  unitPrice: number;
  totalCost: number;
  fullTank: boolean; // Essencial para cálculo real de autonomia entre tanques cheios
  stationName?: string | undefined;
  calculatedAvg?: number | undefined; // km/L ou km/kWh
  nfceKey?: string | undefined; // Chave ou URL de NFC-e escaneada via QR Code
  odometerPhotoUrl?: string | undefined; // Foto do painel / comprovante
  notes?: string | undefined;
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  driverId?: string | undefined;
  type: MaintenanceType;
  status?: MaintenanceStatus | undefined;
  originChecklistId?: string | undefined; // Vínculo automático quando originado de Checklist Não Conforme
  date: string; // ISO YYYY-MM-DD
  odometer: number;
  category: string; // Ex: "Troca de óleo", "Pneus", "Revisão"
  providerName?: string | undefined;
  partsCost: number;
  laborCost: number;
  totalCost: number;
  notes?: string | undefined;
  attachmentUrl?: string | undefined;
}

export interface ExpenseOrRevenue {
  id: string;
  vehicleId: string;
  driverId?: string | undefined;
  kind: LedgerKind;
  category: string; // Ex: "Pedágio", "IPVA", "Multa", "Frete"
  date: string; // ISO YYYY-MM-DD
  amount: number;
  description?: string | undefined;
  bankReferenceId?: string | undefined; // ID de conciliação Open Finance (Pluggy)
}

export interface FineRecord {
  id: string;
  vehicleId: string;
  driverId?: string | undefined;
  date: string; // ISO YYYY-MM-DD
  time?: string | undefined; // HH:mm
  infractionCode: string; // Ex: "7455-0"
  description: string;
  location?: string | undefined;
  points: number;
  amount: number;
  sneDiscountApplied: boolean; // Desconto de 40% via SNE
  driverIndicationDeadline?: string | undefined; // ISO YYYY-MM-DD
  status: FineStatus;
}

export interface ChecklistItemResult {
  id: string;
  label: string;
  compliant: boolean;
  photoUrl?: string | undefined;
  note?: string | undefined;
}

export interface VehicleChecklist {
  id: string;
  vehicleId: string;
  driverId: string;
  date: string; // ISO YYYY-MM-DD
  odometer: number;
  items: ChecklistItemResult[];
  hasIssues: boolean;
  generatedMaintenanceId?: string | undefined;
  generalNotes?: string | undefined;
}

export interface RouteTrip {
  id: string;
  vehicleId: string;
  driverId: string;
  date: string; // ISO YYYY-MM-DD
  origin: string;
  destination: string;
  startOdometer: number;
  endOdometer: number;
  distanceKm: number;
  estimatedKm?: number | undefined; // Distância estimada via Maps para auditoria de desvio
  purpose?: string | undefined;
}

export interface FleetReminder {
  id: string;
  vehicleId: string;
  title: string; // Ex: "Revisão 60.000 km" ou "Renovar Seguro"
  category: 'MANUTENCAO' | 'DOCUMENTACAO' | 'SEGURO' | 'OUTRO';
  dueDate?: string | undefined; // ISO YYYY-MM-DD
  dueOdometer?: number | undefined;
  completed: boolean;
  completedAt?: string | undefined;
  notes?: string | undefined;
}

export interface VehicleDocumentRecord {
  id: string;
  vehicleId: string;
  docType: DocumentType;
  referenceYear: number;
  dueDate: string; // ISO YYYY-MM-DD
  amount: number;
  stateUf?: string | undefined;
  providerOrAuthority?: string | undefined; // Seguradora, Sefaz, Detran
  policyOrCode?: string | undefined; // Nº Apólice, Guia DARE/GARE, CRLV-e
  status: DocumentStatus;
  paidAt?: string | undefined;
  autoGenerated?: boolean | undefined;
  notes?: string | undefined;
}

export interface FleetStateSnapshot {
  vehicles: Vehicle[];
  drivers: Driver[];
  fuelings: FuelingRecord[];
  maintenances: MaintenanceRecord[];
  ledger: ExpenseOrRevenue[];
  fines: FineRecord[];
  documents: VehicleDocumentRecord[];
  checklists: VehicleChecklist[];
  routes: RouteTrip[];
  reminders: FleetReminder[];
}

export interface FleetModuleUser {
  id: string;
  name: string;
  email?: string | undefined;
  role: 'GESTOR' | 'MOTORISTA' | 'ADMIN';
}

export interface FleetRepositoryAdapter {
  loadSnapshot(): Promise<FleetStateSnapshot>;
  saveSnapshot(snapshot: FleetStateSnapshot): Promise<void>;
  resetToSeed?(): Promise<FleetStateSnapshot>;
}

export interface FleetModuleProps {
  adapter?: FleetRepositoryAdapter | undefined;
  currentUser?: FleetModuleUser | undefined;
  onNavigateBack?: (() => void) | undefined;
  initialTab?: FleetTab | undefined;
  embedded?: boolean | undefined;
}
