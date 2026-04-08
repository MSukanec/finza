'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { useFinanceStore } from '@/stores/finance-store';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, CheckCircle2, ArrowRightLeft, FileSpreadsheet } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

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

export function TransactionsImportView() {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<CSVRow[]>([]);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'ready' | 'importing' | 'done' | 'error'>('idle');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFile(file);
    setStatus('parsing');

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsedRows(results.data);
        setStatus('ready');
        addLog(`✅ Archivo cargado: ${results.data.length} filas detectadas.`);
      },
      error: (err) => {
        setStatus('error');
        addLog(`❌ Error parseando CSV: ${err.message}`);
      }
    });
  };

  const processImport = async () => {
    setStatus('importing');
    addLog('🚀 Iniciando proceso inteligente de importación...');
    const state = useFinanceStore.getState();
    const { data: userData } = await supabase.from('users').select('id').eq('auth_id', state.user?.id).single();
    if (!userData) {
      addLog('❌ Error: Usuario no encontrado en BD.');
      setStatus('error');
      return;
    }

    try {
      // 1. Gather all unique wallets and categories
      const uniqueWallets = new Set<string>();
      const uniqueCategories = new Map<string, {group: string, name: string, type: 'income'|'expense'}>();

      parsedRows.forEach(row => {
        if (row.BILLETERA) uniqueWallets.add(row.BILLETERA.trim());
        if (row.CATEGORIA && row.SUBCATEGORIA && row.CATEGORIA.toUpperCase() !== 'MOVIMIENTOS') {
          const t = row.TIPO?.toUpperCase() === 'INGRESO' ? 'income' : 'expense';
          uniqueCategories.set(`${t}-${row.CATEGORIA.trim()}-${row.SUBCATEGORIA.trim()}`, {
             group: row.CATEGORIA.trim(),
             name: row.SUBCATEGORIA.trim(),
             type: t
          });
        }
      });

      addLog(`🔍 Detectadas ${uniqueWallets.size} billeteras y ${uniqueCategories.size} categorías.`);

      // 2. Create missing wallets
      const currentWallets = [...state.accounts];
      for (const w of Array.from(uniqueWallets)) {
        if (!currentWallets.find(a => a.name.toLowerCase() === w.toLowerCase())) {
          addLog(`✨ Creando billetera: ${w}`);
          const { data: newW } = await supabase.from('wallets').insert({
            user_id: userData.id,
            name: w,
            type: 'bank',
            currency_code: 'ARS' // Default for import, user can edit later
          }).select().single();
          if (newW) currentWallets.push(newW as any);
        }
      }

      // 3. Create missing categories
      const currentCategories = [...state.categories];
      for (const cat of Array.from(uniqueCategories.values())) {
        const exists = currentCategories.find(c => 
          c.name.toLowerCase() === cat.name.toLowerCase() && 
          c.type === cat.type && 
          (c.group_name || 'General').toLowerCase() === cat.group.toLowerCase()
        );
        if (!exists) {
          addLog(`✨ Creando categoría: ${cat.group} > ${cat.name}`);
          const { data: newC } = await supabase.from('categories').insert({
            user_id: userData.id,
            name: cat.name,
            group_name: cat.group,
            type: cat.type
          }).select().single();
          if (newC) currentCategories.push(newC as any);
        }
      }

      // 4. Process Rows & Fuse Transfers
      addLog('🧠 Analizando movimientos y fusionando transferencias...');
      const transactionsToInsert = [];
      const pendingTransfers: any[] = [];

      for (const row of parsedRows) {
        if (!row.TIPO || !row.TOTAL) continue;

        // Parse Date (DD-MM-YY to ISO)
        // Note: depends on excel format. Assuming DD/MM/YYYY or DD-MM-YYYY or YY
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
        const amount = parseFloat(row.TOTAL.replace(',', '.').replace(/[^0-9.-]+/g,""));
        const wallet = currentWallets.find(w => w.name.toLowerCase() === row.BILLETERA?.trim().toLowerCase());
        const currency = row.FIAT?.toUpperCase().startsWith('D') ? 'USD' : 'ARS';
        
        let description = row.DETALLE?.trim() || '';
        if (row.NOMBRE || row.APELLIDO) {
          const fullname = `${row.NOMBRE || ''} ${row.APELLIDO || ''}`.trim();
          description = `[${fullname}] ${description}`.trim();
        }

        let invoicedAt = null;
        if (row.FACTURADO && row.FACTURADO.toLowerCase() === 'x') {
           invoicedAt = dateObj.toISOString();
        }

        // TRANSFER LOGIC
        if (row.CATEGORIA?.toUpperCase() === 'MOVIMIENTOS') {
           const sameDateTransfers = pendingTransfers.filter(pt => 
              pt.dateStr === row.FECHA && 
              Math.abs(pt.amount - amount) < 2 && // allow tiny rounding diffs
              pt.type !== type
           );

           if (sameDateTransfers.length > 0) {
              // Fusion !!
              const matched = sameDateTransfers[0];
              pendingTransfers.splice(pendingTransfers.indexOf(matched), 1); // remove from pending

              const isExpense = type === 'expense';
              const sourceWalletId = isExpense ? wallet?.id : matched.walletId;
              const destWalletId = isExpense ? matched.walletId : wallet?.id;

              transactionsToInsert.push({
                 user_id: userData.id,
                 type: 'transfer',
                 amount: amount,
                 currency_code: currency,
                 wallet_id: sourceWalletId,
                 destination_account_id: destWalletId,
                 description: 'Transferencia (Auto-fusionada)',
                 date: dateObj.toISOString(),
                 invoiced_at: null
              });
              continue;
           } else {
              // Add to pending
              pendingTransfers.push({
                 dateStr: row.FECHA,
                 type: type,
                 amount: amount,
                 walletId: wallet?.id,
                 currency,
                 dateObj
              });
              continue; // Don't insert as normal tx yet
           }
        }

        // NORMAL TX
        const cat = currentCategories.find(c => 
          c.name.toLowerCase() === row.SUBCATEGORIA?.trim().toLowerCase() && 
          (c.group_name || '').toLowerCase() === row.CATEGORIA?.trim().toLowerCase() &&
          c.type === type
        );

        transactionsToInsert.push({
           user_id: userData.id,
           type: type,
           amount: amount,
           currency_code: currency,
           wallet_id: wallet?.id || null,
           category_id: cat?.id || null,
           description: description || 'Importado',
           date: dateObj.toISOString(),
           invoiced_at: invoicedAt
        });
      }

      // Add leftover unmatched transfers as normal txs
      if (pendingTransfers.length > 0) {
         addLog(`⚠️ Quedaron ${pendingTransfers.length} 'MOVIMIENTOS' sin pareja (se importarán como normales).`);
         pendingTransfers.forEach(pt => {
            transactionsToInsert.push({
               user_id: userData.id,
               type: pt.type,
               amount: pt.amount,
               currency_code: pt.currency,
               wallet_id: pt.walletId,
               description: 'Movimiento huérfano',
               date: pt.dateObj.toISOString(),
               invoiced_at: null
            });
         });
      }

      // 5. Bulk Insert Transactions
      addLog(`⏳ Insertando ${transactionsToInsert.length} movimientos en la base de datos...`);
      // Chunk inserts to avoid supabase limits (e.g. 1000 per request)
      const chunkSize = 500;
      for (let i = 0; i < transactionsToInsert.length; i += chunkSize) {
         const chunk = transactionsToInsert.slice(i, i + chunkSize);
         const { error } = await supabase.from('transactions').insert(chunk);
         if (error) throw error;
      }

      addLog(`✅ ¡Importación finalizada con éxito!`);
      setStatus('done');
      await state.hydrate(); // Refresh UI State

    } catch (err: any) {
      addLog(`❌ Error Crítico: ${err.message}`);
      setStatus('error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Importador Masivo Inteligente</h1>
          <p className="text-muted-foreground">Convierte tu histórico de Excel a la Arquitectura Finza V2.</p>
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Paso 1: Sube tu Excel (como CSV)</CardTitle>
          <CardDescription>
            Guarda tu Excel usando &quot;Guardar como -{'>'} CSV delimitado por comas&quot; y súbelo aquí. Formato esperado de columnas: FECHA, TIPO, CATEGORIA, SUBCATEGORIA, DETALLE, FIAT, BILLETERA, TOTAL, NOMBRE, APELLIDO, FACTURADO.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border/50 rounded-2xl p-8 hover:bg-accent/30 transition-colors relative">
             <Upload className="w-10 h-10 text-muted-foreground mb-4" />
             <p className="text-sm font-medium">Arrastra tu archivo CSV aquí, o haz clic</p>
             <input 
               type="file" 
               accept=".csv" 
               className="absolute inset-0 opacity-0 cursor-pointer" 
               onChange={handleFileUpload}
               disabled={status === 'importing'}
             />
          </div>
        </CardContent>
      </Card>

      {['ready', 'importing', 'done', 'error'].includes(status) && (
        <Card className="border-border/50 border-primary/20 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                {status === 'done' ? <CheckCircle2 className="w-5 h-5 text-income" /> : <ArrowRightLeft className="w-5 h-5 text-primary" />}
                Progreso y Logs
              </CardTitle>
              {status === 'ready' && (
                <Button onClick={processImport} className="font-bold">
                  Comenzar Magia ⭐
                </Button>
              )}
            </div>
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
              {logs.length === 0 && <p className="opacity-50">Esperando ejecución...</p>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
