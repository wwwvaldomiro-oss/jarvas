import { confirmAction } from '@/lib/popup';
import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ChevronLeft, ChevronRight, Plus, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AGENDA_KINDS, type PersonalKind, type PersonalRecord } from '@/lib/finance/agenda-personal';
import { savePersonalAgenda, deletePersonalAgenda } from '@/lib/finance/agenda.functions';
import { parseBRL } from '@/lib/finance/money';

const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
function moveMonth(month:string, offset:number) { const [y,m] = month.split('-').map(Number); const d = new Date(Date.UTC(y,m-1+offset,1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; }
export function AgendaForm({date, initial, onClose, onSaved}: {date:string; initial?:PersonalRecord | undefined; onClose:()=>void; onSaved:()=>Promise<void>}) {
  const [kind,setKind] = useState<PersonalKind>(initial?.kind ?? 'appointment');
  const [title,setTitle] = useState(initial?.title ?? '');
  const [start,setStart] = useState(initial?.start_date ?? date);
  const [time,setTime] = useState(initial?.time ?? '');
  const [endTime,setEndTime] = useState(initial?.work_details?.end_time ?? '');
  const [breakStart,setBreakStart] = useState(initial?.work_details?.break_start ?? '');
  const [breakEnd,setBreakEnd] = useState(initial?.work_details?.break_end ?? '');
  const [selectedDates,setSelectedDates] = useState<string[]>(initial?.work_details?.selected_dates ?? []);
  const [scheduleName,setScheduleName] = useState(initial?.work_details?.schedule_name ?? '');
  const [monthView,setMonthView] = useState((initial?.start_date ?? date).slice(0,7));
  const [addSchedule,setAddSchedule] = useState(false);
  const [description,setDescription] = useState(initial?.description ?? '');
  const [recurrence,setRecurrence] = useState(initial?.recurrence ?? 'none');
  const [favorite,setFavorite] = useState(initial?.favorite ?? false);
  const [reminder,setReminder] = useState(initial?.reminder ?? true);
  const [rows,setRows] = useState((initial?.items ?? []).map(it => ({...it, price:(it.cents/100).toFixed(2).replace('.',',')})));
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const save = useServerFn(savePersonalAgenda), remove = useServerFn(deletePersonalAgenda);
  const list = kind === 'tasks' || kind === 'shopping';
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setError('');
    const items = rows.map(r => ({key:r.key,description:r.description,quantity:Number(r.quantity),cents:kind === 'shopping' ? parseBRL(r.price) : 0}));
    if (list && (!items.length || items.some(i => !i.description.trim() || i.cents === null || i.quantity <= 0))) {setError('Preencha os itens e seus valores.');return;}
    if (kind === 'work') {
      if (!time || !endTime) { setError('Informe horário de entrada e saída.'); return; }
      if (Boolean(breakStart) !== Boolean(breakEnd)) { setError('Informe início e fim do intervalo.'); return; }
      if (recurrence === 'custom' && selectedDates.length === 0) { setError('Selecione os dias de trabalho no calendário.'); return; }
    }
    setBusy(true);
    try { await save({data:{id:initial?.id,kind,title,start_date:start,time,description,recurrence:kind === 'birthday' ? 'yearly' : recurrence,work_details:kind === 'work' ? {end_time:endTime,break_start:breakStart,break_end:breakEnd,schedule_name:recurrence === 'custom' ? (scheduleName.trim() || 'Outro') : '12×36',selected_dates:recurrence === 'custom' ? selectedDates.filter(d => d >= start).sort() : []} : undefined,favorite,reminder:!list && kind !== 'work' && reminder,items:items.map(i => ({...i,cents:i.cents ?? 0}))}}); await onSaved(); onClose(); }
    catch {setError('Não foi possível salvar. Tente novamente.');} finally {setBusy(false);}
  }
  return <Dialog open onOpenChange={open => {if (!open) onClose();}}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{initial ? 'Editar' : 'Adicionar à agenda'}</DialogTitle><DialogDescription>{date.split('-').reverse().join('/')}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2"><Label>Tipo</Label><Select value={kind} onValueChange={v => {setKind(v as PersonalKind);if(v === 'work' && !['12x36','custom'].includes(recurrence)) setRecurrence('12x36');}}><SelectTrigger aria-label="Tipo de atividade"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(AGENDA_KINDS).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label htmlFor="agenda-title">{kind === 'birthday' ? 'Nome' : kind === 'work' ? 'Empresa / trabalho / local' : 'Título'}</Label><Input id="agenda-title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3"><div className="min-w-0 space-y-2"><Label htmlFor="agenda-date">{kind === 'work' ? 'Primeiro plantão' : kind === 'birthday' ? 'Data de aniversário' : 'Data'}</Label><Input className="min-w-0" id="agenda-date" type="date" required value={start} onChange={e => setStart(e.target.value)} /></div>{kind !== 'birthday' && <div className="min-w-0 space-y-2"><Label htmlFor="agenda-time">{kind === 'work' ? 'Entrada' : 'Hora'}</Label><Input id="agenda-time" type="time" value={time} onChange={e => setTime(e.target.value)} /></div>}</div>
      {kind === 'work' ? <>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label htmlFor="work-end">Saída</Label><Input id="work-end" type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="work-break-start">Início do intervalo</Label><Input id="work-break-start" type="time" value={breakStart} onChange={e => setBreakStart(e.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="work-break-end">Fim do intervalo</Label><Input id="work-break-end" type="time" value={breakEnd} onChange={e => setBreakEnd(e.target.value)} /></div>
        </div>
        <div className="space-y-2"><Label>Escala</Label><div className="flex items-center gap-2"><Select value={recurrence === 'custom' ? 'custom' : '12x36'} onValueChange={v => setRecurrence(v)}><SelectTrigger aria-label="Escala de trabalho" className="flex-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="12x36">12×36</SelectItem><SelectItem value="custom">Outro</SelectItem></SelectContent></Select><Button type="button" variant="outline" onClick={() => {setRecurrence('custom');setAddSchedule(true);}}><Plus className="size-4" />Cadastrar novo</Button></div></div>
        {recurrence === 'custom' && <div className="space-y-3 rounded-lg border p-3">
          {addSchedule && <div className="space-y-2"><Label htmlFor="work-schedule-name">Nome da escala</Label><Input id="work-schedule-name" placeholder="Ex.: Plantões extras" maxLength={100} value={scheduleName} onChange={e => setScheduleName(e.target.value)} /></div>}
          <div className="flex items-center justify-between"><Button type="button" size="icon" variant="ghost" aria-label="Mês anterior da escala" onClick={() => setMonthView(moveMonth(monthView,-1))}><ChevronLeft className="size-4" /></Button><strong className="text-sm capitalize">{new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(monthView+'-01T12:00:00Z'))}</strong><Button type="button" size="icon" variant="ghost" aria-label="Próximo mês da escala" onClick={() => setMonthView(moveMonth(monthView,1))}><ChevronRight className="size-4" /></Button></div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">{weekdays.map(w => <span key={w} className="py-1 text-muted-foreground">{w}</span>)}{Array.from({length:new Date(monthView+'-01T12:00:00Z').getUTCDay()},(_,i)=><span key={'blank'+i}/>)}{Array.from({length:new Date(Number(monthView.slice(0,4)),Number(monthView.slice(5,7)),0).getDate()},(_,i)=>{const day=monthView+'-'+String(i+1).padStart(2,'0');const active=selectedDates.includes(day);return <button key={day} type="button" disabled={day<start} aria-pressed={active} aria-label={'Selecionar '+day} onClick={()=>setSelectedDates(old=>active?old.filter(d=>d!==day):[...old,day])} className={`aspect-square rounded-md border text-xs disabled:opacity-30 ${active?'bg-primary text-primary-foreground':'hover:bg-accent'}`}>{i+1}</button>})}</div>
          <p className="text-xs text-muted-foreground">{selectedDates.filter(d=>d>=start).length} dia(s) selecionado(s). Navegue pelos meses para acrescentar outros plantões.</p>
        </div>}
      </> : kind !== 'birthday' && !list && <div className="space-y-2"><Label>Periodicidade</Label><Select value={recurrence} onValueChange={setRecurrence}><SelectTrigger aria-label="Periodicidade"><SelectValue /></SelectTrigger><SelectContent>{[['none','Não repete'],['daily','Diária'],['weekly','Semanal'],['monthly','Mensal'],['yearly','Anual']].map(([value,label]) => <SelectItem key={value} value={value ?? 'none'}>{label}</SelectItem>)}</SelectContent></Select></div>}
      {!list && <div className="space-y-2"><Label htmlFor="agenda-description">Descrição</Label><Textarea id="agenda-description" maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></div>}
      {!list && kind !== 'work' && <div className="space-y-2"><div className="flex items-center justify-between"><Label className="flex items-center gap-2"><Checkbox checked={reminder} onCheckedChange={v => setReminder(v === true)} />Lembrete</Label><Button type="button" variant="ghost" size="icon" aria-label="Favoritar lembrete" title="Favoritar lembrete" aria-pressed={favorite} onClick={() => setFavorite(!favorite)}><Star className={favorite ? 'fill-primary text-primary' : ''} /></Button></div>{reminder && <p className="text-xs text-muted-foreground">{favorite ? '15, 7, 3 e 1 dias antes e no dia.' : 'No próprio dia.'}</p>}</div>}
      {list && <div className="space-y-3">{rows.map((row,index) => <div key={row.key} className="space-y-2 border-b pb-3"><div className="flex gap-2"><Input aria-label={`Descrição do item ${index+1}`} placeholder="Descrição" required value={row.description} onChange={e => setRows(rows.map(r => r.key === row.key ? {...r,description:e.target.value} : r))} /><Button type="button" variant="ghost" size="icon" aria-label={`Remover item ${index+1}`} onClick={() => setRows(rows.filter(r => r.key !== row.key))}><Trash2 className="size-4" /></Button></div>{kind === 'shopping' && <div className="grid grid-cols-2 gap-2"><div><Label>Quantidade</Label><Input aria-label={`Quantidade do item ${index+1}`} type="number" min="0.01" step="any" value={row.quantity} onChange={e => setRows(rows.map(r => r.key === row.key ? {...r,quantity:Number(e.target.value)} : r))} /></div><div><Label>Valor previsto (R$)</Label><Input aria-label={`Valor previsto do item ${index+1}`} inputMode="decimal" value={row.price} onChange={e => setRows(rows.map(r => r.key === row.key ? {...r,price:e.target.value} : r))} /></div></div>}</div>)}<Button type="button" variant="outline" onClick={() => setRows([...rows,{key:crypto.randomUUID(),description:'',quantity:1,cents:0,price:'0,00'}])}><Plus className="size-4" />Item</Button></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-between gap-2">{initial ? <Button disabled={busy} variant="destructive" type="button" onClick={async () => {if (!(await confirmAction('Excluir este registro e todas as suas ocorrências?'))) return;setBusy(true);try {await remove({data:{id:initial.id}});await onSaved();onClose();}catch {setError('Não foi possível excluir.');setBusy(false);}}}><Trash2 className="size-4" />Excluir</Button> : <span />}<Button disabled={busy} type="submit">{busy ? 'Salvando…' : 'Salvar'}</Button></div>
    </form></DialogContent></Dialog>;
}