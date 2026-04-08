'use client';

import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { useFinanceStore } from '@/stores/finance-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle2, ArrowRightLeft, FileSpreadsheet, RotateCcw, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

interface CSVRow {
  FECHA: string;
  TIPO: string;
  CATEGORIA: string;
  SUBCATEGORIA: string;
  DETALLE: string;
  FIAT: string;
  BILLETERA: string;
  TOTAL: string;
  NOMBRE: string;
  APELLIDO: string;
  FACTURADO: string;
}

interface Mapping {
   original: string;
   mappedId: string | 'create' | 'ignore';
   isAutoMatched: boolean;
   // for categories
   originalGroup?: string;
   originalName?: string;
   type?: 'income'|'expense';
   // for wallets
   currency?: string;
}

function parseArgentineMoney(val: string): number {
  if (!val) return 0;
  let str = String(val).trim();
  
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '');
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const parts = str.replace(/[^0-9,-]/g, '').split(',');
    if (parts.length > 2) return parseFloat(str.replace(/,/g, '')) || 0;
    if (parts[1] && parts[1].length === 3) {
      if (parts[0] === '0' || parts[0] === '-0') {
        str = str.replace(',', '.');
      } else {
        str = str.replace(',', '');
      }
    } else {
      str = str.replace(',', '.');
    }
  } else if (lastDot !== -1) {
    const parts = str.replace(/[^0-9.-]/g, '').split('.');
    if (parts.length > 2) return parseFloat(str.replace(/\./g, '')) || 0;
    if (parts[1] && parts[1].length === 3) {
      if (parts[0] === '0' || parts[0] === '-0') {
        // keep dot
      } else {
        str = str.replace('.', '');
      }
    }
  }
  
  str = str.replace(/[^0-9.-]/g, '');
  return parseFloat(str) || 0;
}

function normalizeStr(str: string): string {
   if (!str) return '';
   return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function computeFuzzyMatch(rawOriginal: string, dbEntities: any[], nameKey: string = 'name'): any {
   const orig = normalizeStr(rawOriginal);
   if (!orig) return null;

   // 1. Exact Name/Trigram Match
   const exact = dbEntities.find(e => normalizeStr(e[nameKey]) === orig);
   if (exact) return exact;

   // 2. Substring Match (e.g., "mercadpago" in "mercado pago" or vice versa)
   const substringBase = dbEntities.find(e => orig.includes(normalizeStr(e[nameKey]).substring(0, 5)) || normalizeStr(e[nameKey]).includes(orig.substring(0, 5)));
   if (substringBase) return substringBase;

   // 3. Very Fuzzy distance check (Levenstein partial mockup)
   // For MVP, if it starts with the same 4 reliable letters, it's a match.
   const fuzzy = dbEntities.find(e => {
       const dbN = normalizeStr(e[nameKey]);
       // Ignore single-letter differences or very short words.
       return orig.length > 3 && dbN.length > 3 && (orig.startsWith(dbN.substring(0, 4)) || dbN.startsWith(orig.substring(0, 4)));
   });

   return fuzzy || null;
}

export function TransactionsImportView() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<CSVRow[]>([]);
  
  const [step, setStep] = useState<'upload' | 'mapping' | 'importing' | 'done' | 'error'>('upload');
  
  const [walletMappings, setWalletMappings] = useState<Record<string, Mapping>>({});
  const [catMappings, setCatMappings] = useState<Record<string, Mapping>>({});

  const [logs, setLogs] = useState<string[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [batches, setBatches] = useState<{ id: string, count: number }[]>([]);

  const accounts = useFinanceStore(s => s.accounts);
  const categories = useFinanceStore(s => s.categories);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const fetchBatches = async () => {
     let allData: any[] = [];
     let hasMore = true;
     let page = 0;
     const PAGE_SIZE = 1000;
     
     while (hasMore) {
       const { data } = await supabase.from('transactions')
           .select('import_batch')
           .not('import_batch', 'is', null)
           .is('deleted_at', null)
           .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
       
       if (!data || data.length === 0) break;
       allData = allData.concat(data);
       if (data.length < PAGE_SIZE) break;
       page++;
     }

     if (allData.length > 0) {
         const counts = allData.reduce((acc: any, row: any) => {
             const bid = row.import_batch;
             acc[bid] = (acc[bid] || 0) + 1;
             return acc;
         }, {});
         
         const formatted = Object.keys(counts).map(key => ({
             id: key,
             count: counts[key]
         })).sort((a,b) => b.id.localeCompare(a.id));
         
         setBatches(formatted);
     } else {
         setBatches([]);
     }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);

    Papa.parse<any>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => {
        let clean = h.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (clean === 'FECHA') return 'FECHA';
        if (clean === 'TIPO') return 'TIPO';
        if (clean === 'CATEGORIA') return 'CATEGORIA';
        if (clean === 'SUBCATEGORIA') return 'SUBCATEGORIA';
        if (clean === 'DESCRIPCION' || clean === 'DETALLE' || clean === 'CONCEPTO') return 'DETALLE';
        if (clean === 'FIAT' || clean === 'MONEDA') return 'FIAT';
        if (clean === 'BILLETERA' || clean === 'CUENTA') return 'BILLETERA';
        if (clean === 'TOTAL' || clean === 'MONTO' || clean === 'IMPORTE') return 'TOTAL';
        return clean;
      },
      complete: (results) => {
        setParsedRows(results.data);
        generateMappings(results.data);
        setStep('mapping');
      },
      error: (err) => {
        setStep('error');
        addLog(`❌ Error parseando CSV: ${err.message}`);
      }
    });
  };

  const generateMappings = (rows: CSVRow[]) => {
      const uWallets = new Map<string, { original: string, currency: string }>();
      const uCats = new Map<string, {group: string, name: string, type: 'income'|'expense'}>();

      rows.forEach(r => {
          const rawW = r.BILLETERA?.trim();
          if (rawW) {
             const cur = r.FIAT?.toUpperCase().startsWith('D') ? 'USD' : 'ARS';
             const id = `${rawW} (${cur})`;
             if (!uWallets.has(id)) {
                 uWallets.set(id, { original: rawW, currency: cur });
             }
          }
          let cVal = r.CATEGORIA?.trim() || '';
          let sVal = r.SUBCATEGORIA?.trim() || '';
          
          if (!cVal && sVal) {
             cVal = sVal;
             sVal = '';
          }
          
          if (cVal && cVal.toUpperCase() !== 'MOVIMIENTOS') {
             const t = r.TIPO?.toUpperCase() === 'INGRESO' ? 'income' : 'expense';
             // CORE FIX 1: If SUBCATEGORIA is empty, they intend cVal to be the Name, and Group to be "General".
             const groupName = sVal ? cVal : 'General';
             const catName = sVal ? sVal : cVal;
             
             uCats.set(`${t}-${groupName}-${catName}`, {
                 group: groupName,
                 name: catName,
                 type: t
             });
          }
      });

      const wm: Record<string, Mapping> = {};
      Array.from(uWallets.entries()).forEach(([key, val]) => {
         const scopedDbAccs = accounts.filter(a => a.currency_id.toLowerCase() === val.currency.toLowerCase());
         const match = computeFuzzyMatch(val.original, scopedDbAccs, 'name');
         wm[key] = {
             original: key,
             originalName: val.original,
             currency: val.currency,
             mappedId: match ? match.id : 'create',
             isAutoMatched: !!match
         };
      });
      
      const cm: Record<string, Mapping> = {};
      Array.from(uCats.entries()).forEach(([key, val]) => {
         // Categories are complex because of Type and Group Name.
         // We filter by type first
         const scopedDbCats = categories.filter(c => c.type === val.type);
         let match = null;
         
         // Try exact multi-level match first
         match = scopedDbCats.find(c => 
             normalizeStr(c.name) === normalizeStr(val.name) && 
             normalizeStr(c.group_name || 'General') === normalizeStr(val.group)
         );

         // If not exact, fallback to fuzzy logic primarily by Name.
         if (!match) {
             const fuzzy = computeFuzzyMatch(val.name, scopedDbCats, 'name');
             if (fuzzy) match = fuzzy;
         }

         cm[key] = {
             original: key,
             originalGroup: val.group,
             originalName: val.name,
             type: val.type,
             mappedId: match ? match.id : 'create',
             isAutoMatched: !!match
         };
      });

      setWalletMappings(wm);
      setCatMappings(cm);
  };

  const processImport = async () => {
    setStep('importing');
    addLog('🚀 Iniciando inyección de datos usando tus mapeos...');
    const state = useFinanceStore.getState();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) {
      addLog('❌ Error: Usuario no encontrado en BD.');
      setStep('error');
      return;
    }

    try {
      // 1. Process "Create" Wallet Mappings
      const finalWallets = { ...walletMappings };
      for (const [key, mapping] of Object.entries(walletMappings)) {
         if (mapping.mappedId === 'create') {
            addLog(`✨ Creando billetera: ${mapping.originalName} en ${mapping.currency}`);
            const { data: newW } = await supabase.from('wallets').insert({
              user_id: userData.id,
              name: mapping.originalName,
              type: 'bank',
              currency_code: mapping.currency
            }).select().single();
            if (newW) finalWallets[key].mappedId = newW.id;
         }
      }

      // 2. Process "Create" Category Mappings
      const finalCats = { ...catMappings };
      for (const [key, mapping] of Object.entries(catMappings)) {
         if (mapping.mappedId === 'create') {
            addLog(`✨ Creando categoría: ${mapping.originalGroup} > ${mapping.originalName}`);
            const { data: newC } = await supabase.from('categories').insert({
              user_id: userData.id,
              name: mapping.originalName,
              group_name: mapping.originalGroup,
              type: mapping.type
            }).select().single();
            if (newC) finalCats[key].mappedId = newC.id;
         }
      }

      // 3. Build Transactions
      const transactionsToInsert = [];
      const pendingTransfers: any[] = [];
      const importBatchId = `batch_${Date.now()}`;

      for (const row of parsedRows) {
        if (!row.TIPO || !row.TOTAL) continue;

        const rawWallet = row.BILLETERA?.trim() || '';
        const currency = row.FIAT?.toUpperCase().startsWith('D') ? 'USD' : 'ARS';
        const wKey = `${rawWallet} (${currency})`;
        
        const wMapping = finalWallets[wKey];
        if (wMapping && wMapping.mappedId === 'ignore') continue;

        let dateObj = new Date();
        if (row.FECHA) {
           const parts = row.FECHA.split(/[-/]/);
           if (parts.length === 3) {
             let year = parseInt(parts[2]);
             if (year < 100) year += 2000;
             dateObj = new Date(year, parseInt(parts[1]) - 1, parseInt(parts[0]));
           }
        }
        
        let type: 'income'|'expense'|'transfer' = row.TIPO.toUpperCase() === 'INGRESO' ? 'income' : 'expense';
        const amount = parseArgentineMoney(row.TOTAL);
        const walletId = wMapping ? wMapping.mappedId : null;
        
        let description = row.DETALLE?.trim() || '';
        if (row.NOMBRE || row.APELLIDO) {
          const fullname = `${row.NOMBRE || ''} ${row.APELLIDO || ''}`.trim();
          description = `[${fullname}] ${description}`.trim();
        }

        let invoicedAt = null;
        if (row.FACTURADO?.toLowerCase() === 'x') {
           invoicedAt = dateObj.toISOString();
        }

        // --- TRANSFER LOGIC ---
        if (row.CATEGORIA?.toUpperCase() === 'MOVIMIENTOS') {
           const sameDateTransfers = pendingTransfers.filter(pt => 
              pt.dateStr === row.FECHA && 
              Math.abs(pt.amount - amount) < 2 &&
              pt.type !== type
           );

           if (sameDateTransfers.length > 0) {
              const matched = sameDateTransfers[0];
              pendingTransfers.splice(pendingTransfers.indexOf(matched), 1);

              const isExpense = type === 'expense';
              const sourceWalletId = isExpense ? walletId : matched.walletId;
              const destWalletId = isExpense ? matched.walletId : walletId;

              const txIdOut = crypto.randomUUID();
              const txIdIn = crypto.randomUUID();

              transactionsToInsert.push({
                 id: txIdOut,
                 user_id: userData.id,
                 type: 'transfer',
                 amount: amount,
                 currency_code: currency,
                 wallet_id: sourceWalletId !== 'create' ? sourceWalletId : null,
                 description: 'Transferencia (Auto-fusionada) - Origen',
                 date: dateObj.toISOString(),
                 invoiced_at: null,
                 import_batch: importBatchId,
                 related_transaction_id: txIdIn
              });

              transactionsToInsert.push({
                 id: txIdIn,
                 user_id: userData.id,
                 type: 'transfer',
                 amount: -amount,
                 currency_code: currency,
                 wallet_id: destWalletId !== 'create' ? destWalletId : null,
                 description: 'Transferencia (Auto-fusionada) - Destino',
                 date: dateObj.toISOString(),
                 invoiced_at: null,
                 import_batch: importBatchId,
                 related_transaction_id: txIdOut
              });
              continue;
           } else {
              pendingTransfers.push({ dateStr: row.FECHA, type, amount, walletId, currency, dateObj });
              continue;
           }
        }

        // --- NORMAL LOGIC ---
        let cVal = row.CATEGORIA?.trim() || '';
        let sVal = row.SUBCATEGORIA?.trim() || '';
        
        if (!cVal && sVal) {
           cVal = sVal;
           sVal = '';
        }

        const groupName = sVal ? cVal : 'General';
        const catName = sVal ? sVal : cVal;
        const mapKey = `${type}-${groupName}-${catName}`;
        const cMapping = finalCats[mapKey];

        if (cMapping && cMapping.mappedId === 'ignore') continue;

        transactionsToInsert.push({
           id: crypto.randomUUID(),
           user_id: userData.id,
           type: type,
           amount: amount,
           currency_code: currency,
           wallet_id: walletId !== 'create' ? walletId : null,
           category_id: (cMapping && cMapping.mappedId !== 'create') ? cMapping.mappedId : null,
           description: description || 'Importado',
           date: dateObj.toISOString(),
           invoiced_at: invoicedAt,
           import_batch: importBatchId
        });
      }

      if (pendingTransfers.length > 0) {
         addLog(`⚠️ Quedaron ${pendingTransfers.length} 'MOVIMIENTOS' sin pareja.`);
         pendingTransfers.forEach(pt => {
            transactionsToInsert.push({
               id: crypto.randomUUID(),
               user_id: userData.id,
               type: pt.type,
               amount: pt.amount,
               currency_code: pt.currency,
               wallet_id: pt.walletId !== 'create' ? pt.walletId : null,
               description: 'Movimiento huérfano',
               date: pt.dateObj.toISOString(),
               invoiced_at: null,
               import_batch: importBatchId
            });
         });
      }

      addLog(`⏳ Insertando ${transactionsToInsert.length} movimientos...`);
      const chunkSize = 500;
      for (let i = 0; i < transactionsToInsert.length; i += chunkSize) {
         const chunk = transactionsToInsert.slice(i, i + chunkSize);
         const { error } = await supabase.from('transactions').insert(chunk);
         if (error) throw error;
      }

      addLog(`✅ ¡Importación finalizada con éxito!`);
      setStep('done');
      await state.hydrate();
      fetchBatches();

    } catch (err: any) {
      addLog(`❌ Error Crítico: ${err.message}`);
      setStep('error');
    }
  };

  const handleRevert = async (batchId: string) => {
     setConfirmingId(null);
     const { revertImportBatch } = useFinanceStore.getState();
     try {
       await revertImportBatch(batchId);
       await fetchBatches();
       window.location.reload();
     } catch(e: any) {
       console.error("Error revirtiendo el lote", e);
     }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Importador Masivo (Wizard)</h1>
          <p className="text-muted-foreground">Mapea tus Excel con control total antes de inyectar a la base.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            {step === 'upload' && (
                <Card className="border-border/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Paso 1: Sube tu Excel</CardTitle>
                    <CardDescription>
                      Formato esperado: FECHA, TIPO, CATEGORIA, SUBCATEGORIA, DETALLE, FIAT, BILLETERA, TOTAL...
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-border/50 rounded-2xl p-8 hover:bg-accent/30 transition-colors relative">
                       <Upload className="w-10 h-10 text-muted-foreground mb-4" />
                       <p className="text-sm font-medium">Arrastra tu archivo CSV aquí, o haz clic</p>
                       <input 
                         type="file" accept=".csv" 
                         className="absolute inset-0 opacity-0 cursor-pointer" 
                         onChange={handleFileUpload}
                       />
                    </div>
                  </CardContent>
                </Card>
            )}

            {step === 'mapping' && (
               <Card className="border-primary/50 ring-1 ring-primary/20 shadow-lg animate-in fade-in zoom-in-95 duration-300">
                  <CardHeader className="bg-primary/5 rounded-t-xl border-b border-primary/10">
                      <div className="flex items-center justify-between">
                         <div>
                            <CardTitle className="text-lg text-primary">Paso 2: Verifica Mapeos</CardTitle>
                            <CardDescription>Asegúrate de que tus datos de Excel coincidan con la DB.</CardDescription>
                         </div>
                         <Button onClick={processImport} className="gap-2 shrink-0">
                            Inyectar Todo <ChevronRight className="w-4 h-4" />
                         </Button>
                      </div>
                  </CardHeader>
                  <CardContent className="p-0">
                      <div className="p-4 space-y-3 bg-accent/20 border-b border-border/50">
                          <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider">🏦 Billeteras detectadas ({Object.keys(walletMappings).length})</h3>
                          <div className="space-y-2">
                             {Object.values(walletMappings).map((w, idx) => (
                                 <div key={idx} className={cn(
                                     "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border",
                                     w.isAutoMatched ? "border-income/30 bg-income/5" : "border-destructive/30 bg-destructive/5"
                                 )}>
                                     <div className="flex flex-col w-full sm:w-1/2">
                                         <span className="font-medium text-sm">{w.originalName || '(Vacío)'}</span>
                                         <span className="text-xs text-muted-foreground opacity-70">Moneda asignada: {w.currency}</span>
                                     </div>
                                     <select 
                                         className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm font-semibold text-primary"
                                         value={w.mappedId}
                                         onChange={(e) => setWalletMappings(prev => ({...prev, [w.original]: {...w, mappedId: e.target.value, isAutoMatched: e.target.value !== 'create' && e.target.value !== 'ignore'}}))}
                                     >
                                         <option value="create">✨ Crear Nueva Billetera en {w.currency}</option>
                                         <option value="ignore">🗑️ Ignorar y no importar</option>
                                         <optgroup label="Billeteras Existentes Compatibles">
                                            {accounts.filter(acc => acc.currency_id.toLowerCase() === w.currency?.toLowerCase()).map(acc => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
                                         </optgroup>
                                     </select>
                                 </div>
                             ))}
                          </div>
                      </div>

                      <div className="p-4 space-y-3">
                          <h3 className="text-sm font-bold uppercase text-muted-foreground tracking-wider">📂 Categorías detectadas ({Object.keys(catMappings).length})</h3>
                          <div className="space-y-2">
                             {Object.values(catMappings).map((c, idx) => (
                                 <div key={idx} className={cn(
                                     "flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border",
                                     c.isAutoMatched ? "border-income/30 bg-income/5" : "border-destructive/30 bg-destructive/5"
                                 )}>
                                     <div className="flex flex-col w-full sm:w-1/2">
                                        <span className="font-medium text-sm">{c.originalGroup} &gt; {c.originalName}</span>
                                        <span className="text-xs text-muted-foreground opacity-70">Tipo: {c.type === 'income' ? 'Ingreso' : 'Gasto'}</span>
                                     </div>
                                     <select 
                                         className="flex h-9 w-full rounded-md border border-input bg-background/50 px-3 py-1 text-sm shadow-sm"
                                         value={c.mappedId}
                                         onChange={(e) => setCatMappings(prev => ({...prev, [c.original]: {...c, mappedId: e.target.value, isAutoMatched: e.target.value !== 'create' && e.target.value !== 'ignore'}}))}
                                     >
                                         <option value="create">✨ Crear Nueva Categoría</option>
                                         <option value="ignore">🗑️ Ignorar y no importar</option>
                                         <optgroup label="Categorías Existentes">
                                            {categories.filter(dbC => dbC.type === c.type).map(dbC => (
                                                <option key={dbC.id} value={dbC.id}>{dbC.group_name || 'General'} &gt; {dbC.name}</option>
                                            ))}
                                         </optgroup>
                                     </select>
                                 </div>
                             ))}
                          </div>
                      </div>
                  </CardContent>
               </Card>
            )}

            {['importing', 'done', 'error'].includes(step) && (
              <Card className="border-border/50 border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {step === 'done' ? <CheckCircle2 className="w-5 h-5 text-income" /> : <ArrowRightLeft className="w-5 h-5 text-primary animate-pulse" />}
                    Progreso y Logs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-background rounded-xl border border-border/50 p-4 font-mono text-xs text-muted-foreground h-64 overflow-y-auto space-y-2">
                    {logs.map((log, i) => (
                      <div key={i} className={
                        log.startsWith('❌') ? 'text-destructive font-semibold' : 
                        log.startsWith('✅') ? 'text-income font-medium' : 
                        log.startsWith('✨') ? 'text-primary' : ''
                      }>
                        {log}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
          
          <div className="space-y-6">
            <Card className="border-border/50 border-destructive/20 bg-destructive/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-destructive/10 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" />
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                    <RotateCcw className="w-5 h-5" />
                    Lotes Importados
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {batches.length === 0 ? (
                      <p className="text-sm text-destructive/70 text-center py-4">No hay importaciones aún.</p>
                  ) : (
                      <div className="space-y-3">
                         {batches.map(batch => (
                             <div key={batch.id} className="bg-background/80 p-3 rounded-lg border border-destructive/20 flex flex-col gap-2 relative z-10 hover:border-destructive/40 transition-colors">
                                 <div className="flex justify-between items-center">
                                    <span className="font-mono text-xs font-semibold text-destructive">{batch.id}</span>
                                    <Badge variant="outline" className="text-xs bg-destructive/5 border-destructive/20 text-destructive">
                                        {batch.count} filas
                                    </Badge>
                                 </div>
                                 {confirmingId === batch.id ? (
                                    <div className="flex gap-2">
                                        <Button variant="destructive" size="sm" className="w-full text-xs font-bold" onClick={() => handleRevert(batch.id)}>Confirmar Peligro ⚠️</Button>
                                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setConfirmingId(null)}>Cancelar</Button>
                                    </div>
                                 ) : (
                                    <Button variant="outline" size="sm" className="w-full text-xs text-destructive hover:bg-destructive hover:text-white" onClick={() => setConfirmingId(batch.id)}>
                                        Revertir Lote Completo
                                    </Button>
                                 )}
                             </div>
                         ))}
                      </div>
                  )}
                </CardContent>
            </Card>
          </div>
      </div>
    </div>
  );
}
