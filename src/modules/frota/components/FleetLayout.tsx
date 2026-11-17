import React, { useState } from 'react';
import {
  ArrowLeft,
  CarFront,
  ClipboardCheck,
  FileCheck2,
  GitBranch,
  LayoutDashboard,
  Menu,
  Plus,
  Receipt,
  Route as RouteIcon,
  X,
} from 'lucide-react';
import { useFleet } from '../context/FleetContext';
import type { FleetTab } from '../types/fleet.types';

interface FleetLayoutProps {
  activeTab: FleetTab;
  onChangeTab: (tab: FleetTab) => void;
  onOpenQuickEntry: () => void;
  onOpenIntegrationDrawer: () => void;
  onNavigateBack?: (() => void) | undefined;
  embedded?: boolean | undefined;
  children: React.ReactNode;
}

const SECTION_BUTTONS: {
  id: FleetTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'veiculos', label: 'Veículos e Motoristas', icon: CarFront },
  { id: 'documentos', label: 'Documentos e Débitos', icon: FileCheck2 },
  { id: 'lancamentos', label: 'Lançamentos', icon: Receipt },
  { id: 'checklists', label: 'Checklist Veicular', icon: ClipboardCheck },
  { id: 'percursos', label: 'Percursos e Lembretes', icon: RouteIcon },
];

const TAB_TITLES: Record<FleetTab, string> = {
  dashboard: 'Visão Geral',
  veiculos: 'Veículos e Motoristas',
  documentos: 'Documentos e Débitos',
  lancamentos: 'Lançamentos',
  checklists: 'Checklist Veicular',
  percursos: 'Percursos e Lembretes',
};

export const FleetLayout: React.FC<FleetLayoutProps> = ({
  activeTab,
  onChangeTab,
  onOpenQuickEntry,
  onOpenIntegrationDrawer,
  onNavigateBack,
  embedded = false,
  children,
}) => {
  const { snapshot, currentUser, selectedVehicleFilter, setSelectedVehicleFilter } = useFleet();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const sectionToolbar = (
    <div className="mb-6 pb-4 border-b border-[#E7E1D5] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
      <nav
        aria-label="Seções de Gestão de Frota"
        className="flex flex-wrap items-center gap-2"
      >
        {SECTION_BUTTONS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeTab(item.id)}
              className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#173D4A] text-white'
                  : 'bg-white border border-[#E7E1D5] text-[#0C1928] hover:bg-[#E7E1D5]/30'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-[#B99555]' : 'text-[#5C6B7A]'
                }`}
              />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {embedded && (
        <div className="flex items-center gap-2.5 shrink-0">
          <select
            value={selectedVehicleFilter}
            onChange={(e) => setSelectedVehicleFilter(e.target.value)}
            aria-label="Filtrar por veículo"
            className="h-10 rounded-lg border border-[#E7E1D5] bg-white px-3 text-xs font-medium text-[#0C1928] focus:outline-none focus:ring-2 focus:ring-[#173D4A] max-w-[220px]"
          >
            <option value="TODOS">Todos os veículos ({snapshot.vehicles.length})</option>
            {snapshot.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.model}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onOpenQuickEntry}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-[#B99555] hover:bg-[#a98648] text-[#0C1928] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Novo Registro</span>
          </button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <div className="fleet-module-root w-full bg-[#F7F8FA] text-[#0C1928] p-4 sm:p-6">
        <div className="max-w-[1440px] w-full mx-auto">
          {sectionToolbar}
          {children}
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#0C1928] text-white select-none">
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <span className="font-display text-lg font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
          Órion / Conecta
        </span>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden rounded-md p-1.5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Fechar menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto" aria-label="Navegação principal">
        <button
          type="button"
          onClick={() => {
            onChangeTab('dashboard');
            setMobileMenuOpen(false);
          }}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium bg-[#173D4A] text-white transition-colors text-left whitespace-nowrap cursor-pointer"
        >
          <CarFront className="h-4 w-4 shrink-0 text-[#B99555]" />
          <span className="truncate">Gestão de Frota</span>
        </button>
      </nav>

      <div className="px-3 py-4 border-t border-white/10 space-y-2">
        {onNavigateBack && (
          <button
            type="button"
            onClick={onNavigateBack}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-white/75 hover:bg-white/5 hover:text-white transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 text-white/60" />
            <span>Voltar ao Órion</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onOpenIntegrationDrawer();
            setMobileMenuOpen(false);
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-lg text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap"
        >
          <GitBranch className="h-4 w-4 shrink-0 text-[#B99555]" />
          <span>Integração Git & SQL</span>
        </button>

        <div className="px-3.5 pt-2 pb-1">
          <p className="text-xs font-medium text-white truncate">{currentUser.name}</p>
          <p className="text-[11px] text-white/60 truncate">
            {currentUser.role === 'GESTOR'
              ? 'Gestor de Frota'
              : currentUser.role === 'MOTORISTA'
              ? 'Motorista'
              : 'Administrador'}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fleet-module-root min-h-screen flex bg-[#F7F8FA] text-[#0C1928]">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-[#0C1928] sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Drawer Mobile */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#0C1928]/60 backdrop-blur-[1px]"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] h-full shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contrato 3 Zonas */}
        <header className="sticky top-0 z-30 bg-white border-b border-[#E7E1D5] px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden rounded-lg p-2 text-[#0C1928] hover:bg-[#F7F8FA] border border-[#E7E1D5] transition-colors"
              aria-label="Abrir navegação"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <button
                type="button"
                onClick={() => onChangeTab('dashboard')}
                className="font-display text-base sm:text-lg font-semibold text-[#0C1928] hover:text-[#173D4A] transition-colors whitespace-nowrap cursor-pointer"
              >
                Gestão de Frota
              </button>
              {activeTab !== 'dashboard' && (
                <>
                  <span className="hidden sm:inline text-[#E7E1D5]" aria-hidden="true">
                    /
                  </span>
                  <span className="hidden sm:inline text-sm font-medium text-[#5C6B7A] truncate">
                    {TAB_TITLES[activeTab]}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label htmlFor="fleet-vehicle-scope" className="sr-only">
              Filtrar por veículo
            </label>
            <select
              id="fleet-vehicle-scope"
              value={selectedVehicleFilter}
              onChange={(e) => setSelectedVehicleFilter(e.target.value)}
              className="hidden sm:block h-9 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] px-3 text-xs font-medium text-[#0C1928] focus:outline-none focus:ring-2 focus:ring-[#173D4A] max-w-[220px]"
            >
              <option value="TODOS">Todos os veículos ({snapshot.vehicles.length})</option>
              {snapshot.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate} — {v.model}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onOpenQuickEntry}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#B99555] hover:bg-[#a98648] text-[#0C1928] text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>Novo Registro</span>
            </button>
          </div>
        </header>

        {/* Filtro de veículo no mobile */}
        <div className="sm:hidden bg-white border-b border-[#E7E1D5] px-4 py-2.5">
          <select
            value={selectedVehicleFilter}
            onChange={(e) => setSelectedVehicleFilter(e.target.value)}
            aria-label="Filtrar por veículo"
            className="w-full h-9 rounded-lg border border-[#E7E1D5] bg-[#F7F8FA] px-3 text-xs font-medium text-[#0C1928]"
          >
            <option value="TODOS">Todos os veículos ({snapshot.vehicles.length})</option>
            {snapshot.vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate} — {v.model}
              </option>
            ))}
          </select>
        </div>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {sectionToolbar}
          {children}
        </main>
      </div>
    </div>
  );
};
