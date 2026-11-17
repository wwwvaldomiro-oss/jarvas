import React, { useState } from 'react';
import { Toaster } from 'sonner';
import { ExportIntegrationDrawer } from './components/ExportIntegrationDrawer';
import { FleetLayout } from './components/FleetLayout';
import { QuickEntryModal, type QuickEntryKind } from './components/QuickEntryModal';
import { FleetProvider } from './context/FleetContext';
import { ChecklistsPage } from './pages/ChecklistsPage';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsDebtsPage } from './pages/DocumentsDebtsPage';
import { LedgerPage } from './pages/LedgerPage';
import { RoutesRemindersPage } from './pages/RoutesRemindersPage';
import { VehiclesDriversPage } from './pages/VehiclesDriversPage';
import type { FleetModuleProps, FleetTab } from './types/fleet.types';

export const FleetModule: React.FC<FleetModuleProps> = ({
  adapter,
  currentUser,
  onNavigateBack,
  initialTab = 'dashboard',
  embedded = false,
}) => {
  const [activeTab, setActiveTab] = useState<FleetTab>(initialTab);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [quickEntryKind, setQuickEntryKind] = useState<QuickEntryKind>('ABASTECIMENTO');
  const [integrationOpen, setIntegrationOpen] = useState(false);

  const handleOpenQuickEntry = (kind: QuickEntryKind = 'ABASTECIMENTO') => {
    setQuickEntryKind(kind);
    setQuickEntryOpen(true);
  };

  return (
    <FleetProvider adapter={adapter} currentUser={currentUser}>
      <Toaster position="top-right" richColors closeButton />
      <FleetLayout
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onOpenQuickEntry={() => handleOpenQuickEntry('ABASTECIMENTO')}
        onOpenIntegrationDrawer={() => setIntegrationOpen(true)}
        onNavigateBack={onNavigateBack}
        embedded={embedded}
      >
        {activeTab === 'dashboard' && (
          <DashboardPage
            onNavigateTab={setActiveTab}
            onOpenQuickEntry={handleOpenQuickEntry}
          />
        )}
        {activeTab === 'veiculos' && <VehiclesDriversPage />}
        {activeTab === 'documentos' && <DocumentsDebtsPage />}
        {activeTab === 'lancamentos' && (
          <LedgerPage onOpenQuickEntry={handleOpenQuickEntry} />
        )}
        {activeTab === 'checklists' && <ChecklistsPage />}
        {activeTab === 'percursos' && (
          <RoutesRemindersPage onOpenQuickEntry={handleOpenQuickEntry} />
        )}
      </FleetLayout>

      <QuickEntryModal
        open={quickEntryOpen}
        initialKind={quickEntryKind}
        onClose={() => setQuickEntryOpen(false)}
      />

      <ExportIntegrationDrawer
        open={integrationOpen}
        onClose={() => setIntegrationOpen(false)}
      />
    </FleetProvider>
  );
};
