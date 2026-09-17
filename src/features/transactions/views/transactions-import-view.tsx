'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  RotateCcw,
  Sparkles,
  Tags,
  Upload,
  Wallet,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Picker, type PickerOption } from '@/components/ui/picker';
import { PageLayout } from '@/components/layout/page-layout';
import { supabase } from '@/lib/supabase/client';
import { useFinanceStore } from '@/stores/finance-store';
import { useGlobalDialog } from '@/components/providers/dialog-provider';
import { cn } from '@/lib/utils';
import {
  clave,
  emparejar,
  emparejarTransferencias,
  ErrorDePlanilla,
  buscarRegla,
  esResumenVisa,
  ErrorDePdf,
  huella,
  leerPdf,
  leerResumenVisa,
  resumenAMovimientos,
  interpretar,
  leerPlanilla,
  marcarRepetidas,
  reglaDesdeFila,
  type Confianza,
  type Descartada,
  type Movimiento,
  type Regla,
} from '@/lib/import';

/**
 * De qué adaptador viene el archivo. Es lo que permite que "cuota" signifique
 * una cosa en el resumen de la tarjeta y otra en la planilla del negocio: las
 * reglas se aprenden y se buscan por origen.
 */
type Origen = 'planilla' | 'visa';

/** El nombre con el que entra la tarjeta hasta que se la mapea a una billetera. */
const BILLETERA_VISA = 'Visa';

type Paso = 'archivo' | 'revision' | 'importando' | 'listo' | 'error';

/** Qué hacer con una billetera o categoría que aparece en el archivo. */
const CREAR = '__crear__';
const IGNORAR = '__ignorar__';

interface Destino {
  clave: string;
  /** Lo que decía el archivo. */
  etiqueta: string;
  /** Contexto: moneda de la billetera, tipo de la categoría. */
  contexto: string;
  filas: number;
  /** Qué tan seguro estuvo el emparejamiento automático, si hubo alguno. */
  confianza: Confianza | null;
  sugerido: string | null;
  decision: string;
  /** Lo resolvió una regla aprendida, no el parecido. */
  porRegla: boolean;
  reglaId: string | null;
}

interface Lectura {
  origen: Origen;
  archivo: string;
  /** Qué se detectó del archivo, para que se vea antes de importar. */
  detalle: string;
  movimientos: Movimiento[];
  descartadas: Descartada[];
  yaImportadas: number;
  pares: number;
  huerfanos: number;
  /** Lo que el archivo trae pero no corresponde importar, y hay que decirlo. */
  avisos: string[];
}

/** Billeteras del mismo nombre pero distinta moneda son billeteras distintas. */
const claveBilletera = (m: Movimiento) => `${clave(m.billetera)}|${m.moneda ?? '?'}`;
/**
 * Un resumen de tarjeta no trae categorías: lo único que identifica al gasto es
 * el comercio. Cuando el adaptador lo provee, es la clave por la que se agrupan
 * las filas y se aprenden las reglas.
 */
const claveCategoria = (m: Movimiento) =>
  m.comercio ? `${m.tipo}|${clave(m.comercio)}` : `${m.tipo}|${clave(m.grupo)}|${clave(m.categoria)}`;

/** El campo sobre el que se aprende y se busca una regla de categoría. */
const campoDeRegla = (origen: Origen) => (origen === 'visa' ? 'detalle' : 'categoria');

/** La huella de una fila del archivo, una vez que se sabe a qué billetera va. */
const huellaDe = (m: Movimiento, walletId: string) =>
  huella({ fecha: m.fecha, monto: m.monto, walletId, tipo: m.tipo, detalle: m.detalle });

interface Lote {
  id: string;
  file_name: string | null;
  source: string;
  rows_imported: number;
  created_at: string;
}

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * Los lotes viejos no tienen nombre de archivo: su `file_name` es la cadena con
 * la que se los identificaba (`batch_1775432100000_ab12cd34`), que no le dice
 * nada a nadie. Para esos vale más la fecha.
 */
const nombrarLote = (l: Lote) =>
  l.file_name && !/^(batch_|xls-)/.test(l.file_name) ? l.file_name : fechaLarga(l.created_at);

const ordenarPendientesPrimero = (a: Destino, b: Destino) => {
  const peso = (d: Destino) => (d.decision === CREAR ? 0 : d.confianza === 'sugerida' ? 1 : 2);
  return peso(a) - peso(b) || b.filas - a.filas;
};

export function TransactionsImportView() {
  const dialog = useGlobalDialog();
  const [paso, setPaso] = useState<Paso>('archivo');
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [billeteras, setBilleteras] = useState<Destino[]>([]);
  const [categorias, setCategorias] = useState<Destino[]>([]);
  const [saltearRepetidas, setSaltearRepetidas] = useState(true);
  const [registro, setRegistro] = useState<string[]>([]);
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);
  const inputArchivo = useRef<HTMLInputElement>(null);

  const cuentas = useFinanceStore((s) => s.accounts);
  const categoriasDb = useFinanceStore((s) => s.categories);
  const transacciones = useFinanceStore((s) => s.transactions);
  const espacioId = useFinanceStore((s) => s.currentWorkspaceId);

  const anotar = (msg: string) => setRegistro((prev) => [...prev, msg]);

  /**
   * Cuántas veces está cargada ya cada huella.
   *
   * Cuenta y no presencia, y la diferencia es plata: en el resumen de tarjeta
   * OSDE aparece facturado DOS veces el mismo día, por el mismo importe y con la
   * misma referencia — dos filas idénticas hasta el byte, más su devolución. Con
   * un simple "¿ya existe?" la segunda se descartaba en silencio y faltaban
   * 443.055 pesos. Comparando cantidades, si el archivo trae dos y la base tiene
   * una, entra una; y si trae dos y ya hay dos, no entra ninguna.
   *
   * Se recalculan acá en vez de leer la columna `fingerprint` porque el store ya
   * tiene todos los movimientos del espacio en memoria y `huella()` es un espejo
   * exacto de la función de la base (lo verifica `npm run check:huellas`).
   */
  const huellasCargadas = useMemo(() => {
    const cuenta = new Map<string, number>();
    for (const t of transacciones) {
      const h = huella({
        fecha: t.date,
        monto: Number(t.amount),
        walletId: t.account_id,
        tipo: t.type,
        detalle: t.description ?? '',
      });
      cuenta.set(h, (cuenta.get(h) ?? 0) + 1);
    }
    return cuenta;
  }, [transacciones]);

  const cargarLotes = async () => {
    // Sin este filtro la consulta trae los lotes de todos los espacios donde el
    // usuario es miembro: RLS acota por membresía, no por espacio activo.
    if (!espacioId) {
      setLotes([]);
      return;
    }

    // Antes esto leía las 1500 transacciones del espacio para agrupar en el
    // cliente. Ahora el lote es una fila propia con sus conteos ya hechos.
    const { data } = await supabase
      .from('import_batches')
      .select('id, file_name, source, rows_imported, created_at')
      .eq('workspace_id', espacioId)
      .is('reverted_at', null)
      .order('created_at', { ascending: false });

    setLotes((data ?? []) as Lote[]);
  };

  /**
   * Lo que el espacio ya aprendió sobre cómo se llaman las cosas en los
   * archivos. Sin esto, cada importación vuelve a preguntar lo mismo.
   */
  const cargarReglas = async () => {
    if (!espacioId) {
      setReglas([]);
      return;
    }
    const { data } = await supabase
      .from('import_rules')
      .select('*')
      .eq('workspace_id', espacioId)
      .is('deleted_at', null);

    setReglas((data ?? []).map(reglaDesdeFila));
  };

  // Depende del espacio: al cambiar de espacio las listas tienen que rehacerse,
  // no quedar mostrando lo del anterior.
  useEffect(() => {
    cargarLotes();
    cargarReglas();
  }, [espacioId]);

  // ------------------------------------------------------------- paso 1

  const reiniciar = () => {
    setPaso('archivo');
    setLectura(null);
    setBilleteras([]);
    setCategorias([]);
    setRegistro([]);
    if (inputArchivo.current) inputArchivo.current.value = '';
  };

  const tomarArchivo = async (archivo: File) => {
    setRegistro([]);
    try {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      const lectura =
        bytes[0] === 0x25 && bytes[1] === 0x50 ? await leerComoPdf(bytes) : leerComoPlanilla(bytes);

      const { movimientos, descartadas, avisos, origen, detalle } = lectura;
      const { pares, huerfanos } = emparejarTransferencias(movimientos);

      const normales = movimientos.filter((m) => !m.esTransferencia);
      const destinos = prepararDestinos(normales, origen);

      // Una fila sólo puede estar repetida si su billetera YA existe: la huella
      // se calcula con el id de billetera, y una billetera por crear todavía no
      // tiene movimientos contra los que chocar.
      const enArchivo = new Map<string, number>();
      for (const m of normales) {
        const w = destinos.get(claveBilletera(m));
        if (!w) continue;
        const h = huellaDe(m, w);
        enArchivo.set(h, (enArchivo.get(h) ?? 0) + 1);
      }
      let yaImportadas = 0;
      for (const [h, n] of enArchivo) yaImportadas += Math.min(n, huellasCargadas.get(h) ?? 0);

      setLectura({
        origen,
        archivo: archivo.name,
        detalle,
        movimientos,
        descartadas,
        yaImportadas,
        pares: pares.length,
        huerfanos: huerfanos.length,
        avisos,
      });
      setPaso('revision');
    } catch (e) {
      setPaso('error');
      anotar(
        e instanceof ErrorDePlanilla || e instanceof ErrorDePdf
          ? `No pude leer el archivo: ${e.message}`
          : `Error inesperado leyendo el archivo: ${(e as Error).message}`
      );
    }
  };

  /** Una planilla: CSV o TSV exportado de Excel o de Google Sheets. */
  const leerComoPlanilla = (bytes: Uint8Array) => {
    const planilla = leerPlanilla(bytes);
    const { movimientos, descartadas } = interpretar(planilla);
    const repetidas = marcarRepetidas(movimientos);
    return {
      origen: 'planilla' as Origen,
      detalle: `${planilla.codificacion} · separador "${planilla.delimitador}" · encabezado en la línea ${planilla.filaEncabezado + 1}`,
      movimientos,
      descartadas,
      avisos: repetidas.size ? [`${repetidas.size} filas se repiten dentro del archivo.`] : [],
    };
  };

  /**
   * Un resumen de tarjeta.
   *
   * El pago del resumen no entra: es una transferencia desde el banco y de qué
   * cuenta salió no está en el PDF. Se avisa con el importe para que nadie crea
   * que se perdió.
   */
  const leerComoPdf = async (bytes: Uint8Array) => {
    const paginas = await leerPdf(bytes);
    if (!esResumenVisa(paginas)) {
      throw new ErrorDePdf('Es un PDF, pero no reconozco el formato. Por ahora leo resúmenes de Visa.');
    }

    const resumen = leerResumenVisa(paginas);
    const { movimientos, pagos } = resumenAMovimientos(resumen, BILLETERA_VISA);
    const plata = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2 });

    const avisos = pagos.map(
      (p) =>
        `El pago del resumen (${p.moneda} ${plata(p.monto)}) no se importa: es una transferencia desde tu banco, y de qué cuenta salió no figura en el PDF.`
    );
    const enCuotas = resumen.filas.filter((f) => f.cuota).length;
    if (enCuotas) {
      avisos.push(`${enCuotas} compras vienen en cuotas: se importa sólo la cuota de este mes.`);
    }

    return {
      origen: 'visa' as Origen,
      detalle: `Resumen Visa · ${resumen.tarjetas.length} tarjetas · total ${plata(resumen.totalArs ?? 0)} y USD ${plata(resumen.totalUsd ?? 0)}`,
      movimientos,
      descartadas: [] as Descartada[],
      avisos,
    };
  };

  /**
   * Propone un destino para cada billetera y categoría del archivo.
   *
   * Sólo se da por resuelto lo que matchea con confianza alta o exacta. Lo
   * dudoso queda como sugerencia visible en vez de aplicarse solo: el
   * importador anterior aceptaba cualquier par que compartiera cuatro letras y
   * mandaba "Comidas" a "Comisiones" sin que nadie se enterara.
   */
  const prepararDestinos = (movimientos: Movimiento[], origen: Origen): Map<string, string> => {
    const conteoB = new Map<string, { m: Movimiento; filas: number }>();
    const conteoC = new Map<string, { m: Movimiento; filas: number }>();
    /** Billeteras del archivo que ya existen en el espacio, por clave. */
    const resueltas = new Map<string, string>();

    for (const m of movimientos) {
      if (m.billetera) {
        const k = claveBilletera(m);
        const prev = conteoB.get(k);
        conteoB.set(k, { m, filas: (prev?.filas ?? 0) + 1 });
      }
      const k = claveCategoria(m);
      const prev = conteoC.get(k);
      conteoC.set(k, { m, filas: (prev?.filas ?? 0) + 1 });
    }

    setBilleteras(
      [...conteoB.entries()]
        .map(([k, { m, filas }]) => {
          // Sin moneda en el archivo, cualquier billetera es candidata y la
          // moneda sale de la que se elija.
          const candidatas = m.moneda
            ? cuentas.filter((c) => c.currency_id.toUpperCase() === m.moneda)
            : cuentas;
          // La regla aprendida gana sobre el parecido: alguien ya afirmó qué
          // significa este texto, y eso pesa más que cualquier heurística.
          const regla = buscarRegla(m, reglas, 'billetera', origen);
          const porRegla = candidatas.find((c) => c.id === regla?.walletId) ?? null;

          const match = porRegla ? null : emparejar(m.billetera, candidatas, (c) => c.name);
          const auto = match && match.confianza !== 'sugerida';
          const elegida = porRegla?.id ?? (auto ? match.item.id : null);
          if (elegida) resueltas.set(k, elegida);

          return {
            clave: k,
            etiqueta: m.billetera,
            contexto: m.moneda ?? 'moneda no declarada',
            filas,
            confianza: match?.confianza ?? null,
            sugerido: porRegla?.name ?? match?.item.name ?? null,
            decision: elegida ?? CREAR,
            porRegla: Boolean(porRegla),
            reglaId: porRegla ? (regla?.id ?? null) : null,
          };
        })
        .sort(ordenarPendientesPrimero)
    );

    setCategorias(
      [...conteoC.entries()]
        .map(([k, { m, filas }]) => {
          const candidatas = categoriasDb.filter((c) => c.type === m.tipo);
          // El par grupo + nombre identifica la categoría; el nombre solo
          // alcanza para sugerir, no para decidir.
          const exacta = candidatas.find(
            (c) =>
              clave(c.name) === clave(m.categoria) &&
              clave(c.group_name || 'General') === clave(m.grupo)
          );
          const regla = buscarRegla(m, reglas, campoDeRegla(origen), origen);
          const porRegla = candidatas.find((c) => c.id === regla?.categoryId) ?? null;

          const match = porRegla
            ? null
            : exacta
              ? { item: exacta, confianza: 'exacta' as Confianza }
              : emparejar(m.categoria, candidatas, (c) => c.name);
          const auto = match && match.confianza !== 'sugerida';
          const nombrar = (c: { group_name?: string; name: string }) =>
            `${c.group_name || 'General'} › ${c.name}`;

          return {
            clave: k,
            etiqueta: `${m.grupo} › ${m.categoria}`,
            contexto: m.tipo === 'income' ? 'Ingreso' : 'Gasto',
            filas,
            confianza: match?.confianza ?? null,
            sugerido: porRegla ? nombrar(porRegla) : match ? nombrar(match.item) : null,
            decision: porRegla?.id ?? (auto ? match.item.id : CREAR),
            porRegla: Boolean(porRegla),
            reglaId: porRegla ? (regla?.id ?? null) : null,
          };
        })
        .sort(ordenarPendientesPrimero)
    );

    return resueltas;
  };

  // ------------------------------------------------------------- paso 2

  const pendientes = useMemo(
    () =>
      [...billeteras, ...categorias].filter((d) => d.decision === CREAR || d.confianza === 'sugerida')
        .length,
    [billeteras, categorias]
  );

  const opcionesBilletera = (d: Destino): PickerOption[] => {
    const moneda = d.contexto;
    const compatibles = cuentas.filter(
      (c) => !/^[A-Z]{3}$/.test(moneda) || c.currency_id.toUpperCase() === moneda
    );
    return [
      { value: CREAR, label: `Crear "${d.etiqueta}"`, hint: /^[A-Z]{3}$/.test(moneda) ? moneda : undefined },
      { value: IGNORAR, label: 'No importar estas filas' },
      ...compatibles.map((c) => ({
        value: c.id,
        label: c.name,
        hint: c.currency_id.toUpperCase(),
      })),
    ];
  };

  const opcionesCategoria = (d: Destino): PickerOption[] => {
    const tipo = d.contexto === 'Ingreso' ? 'income' : 'expense';
    return [
      { value: CREAR, label: `Crear "${d.etiqueta}"` },
      { value: IGNORAR, label: 'No importar estas filas' },
      ...categoriasDb
        .filter((c) => c.type === tipo)
        .map((c) => ({
          value: c.id,
          label: c.name,
          hint: c.group_name || 'General',
        })),
    ];
  };

  const decidir = (
    set: React.Dispatch<React.SetStateAction<Destino[]>>,
    clave: string,
    valor: string
  ) => {
    set((prev) =>
      prev.map((d) =>
        d.clave === clave
          ? {
              ...d,
              decision: valor,
              confianza: valor === CREAR || valor === IGNORAR ? null : 'exacta',
              porRegla: false,
              reglaId: null,
            }
          : d
      )
    );
  };

  // ------------------------------------------------------------- importar

  const importar = async () => {
    if (!lectura) return;

    const { appUserId, currentWorkspaceId, _resolveGroupId, hydrate } = useFinanceStore.getState();

    // La base exige espacio y usuario en cada movimiento. Antes se mandaba el
    // insert igual y fallaba con un error de constraint a mitad de camino.
    if (!currentWorkspaceId) {
      setPaso('error');
      anotar('No hay un espacio activo. Elegí uno antes de importar.');
      return;
    }
    if (!appUserId) {
      setPaso('error');
      anotar('No hay sesión activa.');
      return;
    }

    setPaso('importando');
    setRegistro([]);

    // El lote se crea PRIMERO y con identidad propia: así los movimientos
    // apuntan a una fila real y la importación queda registrada aunque después
    // haya que deshacerla. Antes el lote era una cadena suelta en cada fila.
    const { data: loteRow, error: errorLote } = await supabase
      .from('import_batches')
      .insert({
        workspace_id: currentWorkspaceId,
        user_id: appUserId,
        source: lectura.origen,
        file_name: lectura.archivo,
        encoding: lectura.detalle.slice(0, 200),
        delimiter: null,
        rows_read: lectura.movimientos.length,
      })
      .select('id')
      .single();

    if (errorLote || !loteRow) {
      setPaso('error');
      anotar(`No pude registrar el lote: ${errorLote?.message ?? 'sin respuesta'}`);
      return;
    }

    const lote = loteRow.id as string;
    const base = {
      user_id: appUserId,
      workspace_id: currentWorkspaceId,
      import_batch: lote,
      import_batch_id: lote,
    };

    try {
      // 1. Crear las billeteras que hagan falta.
      const idBilletera = new Map<string, string>();
      for (const d of billeteras) {
        if (d.decision === IGNORAR) continue;
        if (d.decision !== CREAR) {
          idBilletera.set(d.clave, d.decision);
          continue;
        }
        const moneda = /^[A-Z]{3}$/.test(d.contexto) ? d.contexto : 'ARS';
        anotar(`Creando billetera "${d.etiqueta}" en ${moneda}`);
        const { data, error } = await supabase
          .from('wallets')
          .insert({
            user_id: appUserId,
            workspace_id: currentWorkspaceId,
            name: d.etiqueta,
            type: 'bank',
            currency_code: moneda,
          })
          .select('id')
          .single();
        if (error) throw new Error(`No pude crear la billetera "${d.etiqueta}": ${error.message}`);
        idBilletera.set(d.clave, data.id);
      }

      // 2. Crear las categorías que hagan falta, con su grupo.
      //    `group_id` es obligatorio en la base y no tiene default: el
      //    importador anterior mandaba sólo `group_name`, el insert fallaba, el
      //    error no se miraba y las filas entraban sin categoría.
      const idCategoria = new Map<string, string>();
      for (const d of categorias) {
        if (d.decision === IGNORAR) continue;
        if (d.decision !== CREAR) {
          idCategoria.set(d.clave, d.decision);
          continue;
        }
        const [grupo, nombre] = d.etiqueta.split(' › ');
        const tipo = d.contexto === 'Ingreso' ? 'income' : 'expense';
        anotar(`Creando categoría "${grupo} › ${nombre}"`);
        const grupoId = await _resolveGroupId(grupo);
        if (!grupoId) throw new Error(`No pude resolver el grupo "${grupo}".`);
        const { data, error } = await supabase
          .from('categories')
          .insert({
            user_id: appUserId,
            workspace_id: currentWorkspaceId,
            name: nombre,
            group_name: grupo,
            group_id: grupoId,
            type: tipo,
          })
          .select('id')
          .single();
        if (error) throw new Error(`No pude crear la categoría "${d.etiqueta}": ${error.message}`);
        idCategoria.set(d.clave, data.id);
      }

      // 3. Armar los movimientos.
      const { pares, huerfanos } = emparejarTransferencias(lectura.movimientos);
      const esHuerfano = new Set(huerfanos);
      const filas: Record<string, unknown>[] = [];
      let salteadasRepetidas = 0;
      let salteadasSinDestino = 0;

      const monedaDe = (m: Movimiento, cuentaId: string | undefined) =>
        m.moneda ?? cuentas.find((c) => c.id === cuentaId)?.currency_id.toUpperCase() ?? 'ARS';

      // 3a. Transferencias emparejadas: un par de filas ligadas entre sí.
      for (const par of pares) {
        const salida = idBilletera.get(claveBilletera(par.salida));
        const entrada = idBilletera.get(claveBilletera(par.entrada));
        if (!salida || !entrada) {
          salteadasSinDestino += 2;
          continue;
        }
        const idSalida = crypto.randomUUID();
        const moneda = monedaDe(par.salida, salida);
        const detalle = par.salida.detalle || 'Transferencia';

        filas.push({
          ...base,
          id: idSalida,
          type: 'transfer',
          amount: par.salida.monto,
          currency_code: moneda,
          wallet_id: salida,
          category_id: null,
          description: detalle,
          date: par.salida.fecha,
          invoiced_at: null,
          status: 'draft',
          // El enlace va en un solo sentido, igual que en `addTransaction`: la
          // FK no es diferible, así que dos filas que se apuntan entre sí sólo
          // entran si comparten statement, y acá van en bloques de 500.
          related_transaction_id: null,
        });
        // La pata entrante va con monto negativo: así el saldo de la billetera
        // destino sube, porque tanto `wallet_expected_balance` como `hydrate()`
        // restan el monto de toda transferencia.
        filas.push({
          ...base,
          id: crypto.randomUUID(),
          type: 'transfer',
          amount: -par.entrada.monto,
          currency_code: moneda,
          wallet_id: entrada,
          category_id: null,
          description: `Transferencia entrante: ${detalle}`,
          date: par.entrada.fecha,
          invoiced_at: null,
          status: 'draft',
          related_transaction_id: idSalida,
        });
      }

      // 3b. El resto, incluidos los pases que se quedaron sin pareja.
      // Copia de las cuentas: cada fila que se saltea consume una de las que ya
      // están cargadas, así dos filas idénticas contra una sola en la base
      // saltean una y cargan la otra.
      const restantes = new Map(huellasCargadas);
      for (const m of lectura.movimientos) {
        if (m.esTransferencia && !esHuerfano.has(m)) continue; // ya fue como par

        const cuenta = idBilletera.get(claveBilletera(m));
        if (!cuenta) {
          salteadasSinDestino++;
          continue;
        }

        const h = huellaDe(m, cuenta);
        const yaHay = restantes.get(h) ?? 0;
        if (saltearRepetidas && !m.esTransferencia && yaHay > 0) {
          restantes.set(h, yaHay - 1);
          salteadasRepetidas++;
          continue;
        }

        let categoriaId: string | null = null;
        if (!m.esTransferencia) {
          const destino = categorias.find((d) => d.clave === claveCategoria(m));
          if (destino?.decision === IGNORAR) continue;
          categoriaId = idCategoria.get(claveCategoria(m)) ?? null;
        }

        filas.push({
          ...base,
          id: crypto.randomUUID(),
          type: m.tipo,
          amount: m.monto,
          currency_code: monedaDe(m, cuenta),
          wallet_id: cuenta,
          category_id: categoriaId,
          description: m.detalle || 'Importado',
          date: m.fecha,
          invoiced_at: m.fechaFacturado,
          // Un pase sin pareja entra como ingreso o gasto suelto y queda
          // marcado para revisar, en vez de perderse como "movimiento huérfano".
          status: esHuerfano.has(m) ? 'warning' : 'draft',
        });
      }

      if (!filas.length) throw new Error('No quedó ninguna fila para importar.');

      anotar(`Insertando ${filas.length} movimientos…`);
      const TAMANIO = 500;
      for (let i = 0; i < filas.length; i += TAMANIO) {
        const { error } = await supabase.from('transactions').insert(filas.slice(i, i + TAMANIO));
        // Sin esto, un error a mitad de camino dejaba los primeros bloques
        // cargados y la importación a medias, sin forma de saber cuánto entró.
        if (error) {
          await supabase
            .from('transactions')
            .delete()
            .eq('workspace_id', currentWorkspaceId)
            .eq('import_batch_id', lote);
          throw new Error(`${error.message} — no se cargó nada, la importación se deshizo entera.`);
        }
      }

      if (salteadasRepetidas) anotar(`${salteadasRepetidas} filas salteadas por estar repetidas.`);
      if (salteadasSinDestino) anotar(`${salteadasSinDestino} filas salteadas por billetera ignorada.`);
      if (huerfanos.length) {
        anotar(`${huerfanos.length} pases quedaron sin pareja y entraron marcados para revisar.`);
      }
      await supabase
        .from('import_batches')
        .update({
          rows_imported: filas.length,
          rows_skipped: salteadasRepetidas + salteadasSinDestino,
        })
        .eq('id', lote);

      await aprenderDeLoDecidido(currentWorkspaceId, lectura.origen, idBilletera, idCategoria);

      anotar(`Listo: ${filas.length} movimientos importados.`);
      setPaso('listo');

      await hydrate();
      await cargarLotes();
    } catch (e) {
      // El lote se creó antes de escribir nada, así que si la importación no
      // llegó a término tiene que irse con ella: si no, queda listado como una
      // importación de cero filas que nadie hizo.
      await supabase.from('import_batches').delete().eq('id', lote);
      anotar((e as Error).message);
      setPaso('error');
    }
  };

  /**
   * Guarda lo que se acaba de decidir, para que el archivo siguiente no vuelva a
   * preguntarlo.
   *
   * Sólo escribe lo que NO vino ya de una regla: en una importación repetida no
   * hay nada nuevo que aprender y no tiene sentido mandar ochenta llamadas para
   * reafirmar lo mismo. Si algo falla acá, la importación ya está hecha y no se
   * toca: perder el aprendizaje es molesto, deshacer la carga sería peor.
   */
  const aprenderDeLoDecidido = async (
    ws: string,
    origen: Origen,
    idBilletera: Map<string, string>,
    idCategoria: Map<string, string>
  ) => {
    // El builder de supabase es un thenable, no una Promise: se junta y se
    // espera todo junto, y los errores vienen en la respuesta, no como throw.
    const nuevas: PromiseLike<{ error: { message: string } | null }>[] = [];

    for (const d of billeteras) {
      const destino = idBilletera.get(d.clave);
      if (!destino || d.porRegla || !d.etiqueta) continue;
      nuevas.push(
        supabase.rpc('aprender_regla', {
          ws,
          p_field: 'billetera',
          p_pattern: d.etiqueta,
          p_source: origen,
          p_wallet: destino,
          p_match: 'exact',
        })
      );
    }

    for (const d of categorias) {
      const destino = idCategoria.get(d.clave);
      if (!destino || d.porRegla) continue;
      const [grupo, nombre] = d.etiqueta.split(' › ');
      nuevas.push(
        supabase.rpc('aprender_regla', {
          ws,
          p_field: campoDeRegla(origen),
          // En una planilla el patrón es grupo|categoría, con el mismo formato
          // que arma `textoParaRegla`, porque "Comidas|Salmón" y "Bebidas|Salmón"
          // no son lo mismo. En un resumen de tarjeta el patrón es el comercio, y
          // la coincidencia tiene que ser `contains`: el detalle trae pegada una
          // referencia que cambia todos los meses ("ANTHROPIC in1U54iPB"), así
          // que una regla exacta no volvería a matchear nunca.
          p_pattern: origen === 'visa' ? d.etiqueta : `${grupo}|${nombre}`,
          p_source: origen,
          p_type: d.contexto === 'Ingreso' ? 'income' : 'expense',
          p_category: destino,
          p_match: origen === 'visa' ? 'contains' : 'exact',
        })
      );
    }

    const usadas = [...billeteras, ...categorias]
      .filter((d) => d.porRegla && d.reglaId)
      .map((d) => d.reglaId as string);

    const aprendidas = nuevas.length;

    // Un solo update para todas: la misma regla se aplica a cientos de filas y
    // no tiene sentido escribir un update por fila.
    if (usadas.length) {
      nuevas.push(supabase.rpc('registrar_uso_reglas', { ws, ids: usadas }));
    }

    try {
      const fallidas = (await Promise.all(nuevas)).filter((r) => r.error);
      const ok = aprendidas - fallidas.length;
      if (ok > 0) anotar(`${ok} mapeos aprendidos para la próxima.`);
      if (usadas.length) anotar(`${usadas.length} se resolvieron solos con lo aprendido antes.`);
      if (fallidas.length) {
        anotar(`No pude guardar ${fallidas.length} mapeos: ${fallidas[0].error?.message}`);
      }
      await cargarReglas();
    } catch (e) {
      anotar(`Los movimientos se cargaron, pero no pude guardar los mapeos: ${(e as Error).message}`);
    }
  };

  const revertir = async (id: string, filas: number) => {
    const ok = await dialog.confirm(
      'Deshacer importación',
      `Se dan de baja los ${filas} movimientos que cargó esta importación.`,
      { confirmar: 'Deshacer' }
    );
    if (!ok) return;
    try {
      await useFinanceStore.getState().revertImportBatch(id);
      await cargarLotes();
    } catch (e) {
      anotar(`No pude deshacer el lote: ${(e as Error).message}`);
    }
  };

  // ------------------------------------------------------------- render

  const acciones =
    paso === 'revision' ? (
      <>
        <Button variant="outline" size="sm" onClick={reiniciar}>
          Cancelar
        </Button>
        <Button size="sm" onClick={importar}>
          Importar {lectura?.movimientos.length ?? 0} filas
        </Button>
      </>
    ) : paso === 'listo' || paso === 'error' ? (
      <Button size="sm" onClick={reiniciar}>
        Importar otro archivo
      </Button>
    ) : null;

  return (
    <PageLayout
      title="Importar"
      icon={FileSpreadsheet}
      description="Cargá movimientos desde una planilla"
      actions={acciones}
    >
      {paso === 'archivo' && (
        <Panel
          icon={Upload}
          title="Elegí la planilla"
          description="CSV de Excel o Google Sheets, o el PDF del resumen de Visa. El formato se detecta solo."
        >
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-10 text-center transition-colors hover:border-ring/40">
            <Upload className="mb-3 size-8 text-muted-foreground" />
            <span className="text-sm font-medium">Arrastrá el archivo acá, o hacé clic</span>
            <span className="mt-1 text-xs text-muted-foreground">
              Planillas con FECHA, TIPO, CATEGORIA, SUBCATEGORIA, DETALLE, FIAT, BILLETERA y TOTAL,
              o el resumen de tarjeta Visa en PDF
            </span>
            <input
              ref={inputArchivo}
              type="file"
              accept=".csv,.txt,.tsv,.pdf,text/csv,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) tomarArchivo(f);
              }}
            />
          </label>
        </Panel>
      )}

      {paso === 'revision' && lectura && (
        <>
          <Panel
            icon={lectura.origen === 'visa' ? CreditCard : FileSpreadsheet}
            title={lectura.archivo}
            description={lectura.detalle}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato valor={lectura.movimientos.length} etiqueta="Movimientos leídos" />
              <Dato valor={lectura.pares} etiqueta="Transferencias emparejadas" />
              <Dato
                valor={lectura.yaImportadas}
                etiqueta="Ya cargadas"
                alerta={lectura.yaImportadas > 0}
              />
              <Dato
                valor={lectura.descartadas.length}
                etiqueta="Filas descartadas"
                alerta={lectura.descartadas.some((d) => d.motivo === 'ilegible')}
              />
            </div>

            {lectura.avisos.length > 0 && (
              <ul className="mt-4 space-y-2">
                {lectura.avisos.map((aviso, i) => (
                  <li key={i} className="rounded-xl bg-accent/40 px-3 py-2.5 text-sm">
                    {aviso}
                  </li>
                ))}
              </ul>
            )}

            {lectura.yaImportadas > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning/15 px-3 py-2.5">
                <span className="text-sm">
                  {lectura.yaImportadas} de estas filas ya están cargadas en este espacio.
                </span>
                <Button variant="outline" size="sm" onClick={() => setSaltearRepetidas((v) => !v)}>
                  {saltearRepetidas ? 'Importarlas igual' : 'Saltearlas'}
                </Button>
              </div>
            )}

            {lectura.descartadas.some((d) => d.motivo === 'ilegible') && (
              <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
                {lectura.descartadas
                  .filter((d) => d.motivo === 'ilegible')
                  .slice(0, 8)
                  .map((d) => (
                    <li key={d.linea}>
                      Línea {d.linea}: {d.problemas.join(' · ')}
                    </li>
                  ))}
              </ul>
            )}
          </Panel>

          {pendientes > 0 && (
            <Panel
              icon={AlertTriangle}
              title={`${pendientes} sin resolver`}
              description="Todo lo que no matcheó solo, o que matcheó con dudas, está primero en las listas de abajo."
            />
          )}

          <ListaDestinos
            icono={Wallet}
            titulo="Billeteras"
            destinos={billeteras}
            opciones={opcionesBilletera}
            onDecidir={(k, v) => decidir(setBilleteras, k, v)}
          />

          <ListaDestinos
            icono={Tags}
            titulo="Categorías"
            destinos={categorias}
            opciones={opcionesCategoria}
            onDecidir={(k, v) => decidir(setCategorias, k, v)}
          />
        </>
      )}

      {(paso === 'importando' || paso === 'listo' || paso === 'error') && (
        <Panel
          icon={paso === 'listo' ? CheckCircle2 : paso === 'error' ? AlertTriangle : ArrowRightLeft}
          title={
            paso === 'listo' ? 'Importación terminada' : paso === 'error' ? 'No se importó' : 'Importando…'
          }
        >
          <div className="space-y-1.5 font-mono text-xs text-muted-foreground">
            {registro.map((linea, i) => (
              <div key={i} className={cn(paso === 'error' && i === registro.length - 1 && 'text-destructive')}>
                {linea}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel
        icon={RotateCcw}
        title="Importaciones anteriores"
        description="Deshacer un lote da de baja todos sus movimientos."
      >
        {lotes.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Todavía no importaste nada en este espacio.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {lotes.map((lote) => (
              <li key={lote.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{nombrarLote(lote)}</div>
                  <div className="text-xs text-muted-foreground">
                    {fechaLarga(lote.created_at)} · {lote.source}
                  </div>
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {lote.rows_imported} filas
                </Badge>
                <Button variant="outline" size="sm" onClick={() => void revertir(lote.id, lote.rows_imported)}>
                  Deshacer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageLayout>
  );
}

function Dato({ valor, etiqueta, alerta }: { valor: number; etiqueta: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl bg-accent/40 px-3 py-2.5">
      <div className={cn('text-lg font-semibold tabular-nums', alerta && 'text-warning')}>{valor}</div>
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
    </div>
  );
}

function ListaDestinos({
  icono,
  titulo,
  destinos,
  opciones,
  onDecidir,
}: {
  icono: React.ElementType;
  titulo: string;
  destinos: Destino[];
  opciones: (d: Destino) => PickerOption[];
  onDecidir: (clave: string, valor: string) => void;
}) {
  if (destinos.length === 0) return null;

  const sinResolver = destinos.filter((d) => d.decision === CREAR || d.confianza === 'sugerida').length;

  return (
    <Panel
      icon={icono}
      title={`${titulo} (${destinos.length})`}
      description={sinResolver ? `${sinResolver} sin resolver` : 'Todas reconocidas'}
      padded={false}
    >
      <ul className="divide-y divide-border/60">
        {destinos.map((d) => (
          <li
            key={d.clave}
            className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4 md:px-5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{d.etiqueta || '(vacío)'}</span>
                <MarcaConfianza destino={d} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {d.contexto} · {d.filas} {d.filas === 1 ? 'fila' : 'filas'}
                {d.confianza === 'sugerida' && d.sugerido ? ` · ¿será "${d.sugerido}"?` : ''}
              </p>
            </div>
            <div className="w-full md:w-72">
              <Picker
                value={d.decision}
                onValueChange={(v) => onDecidir(d.clave, v)}
                options={opciones(d)}
              />
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function MarcaConfianza({ destino }: { destino: Destino }) {
  if (destino.decision === IGNORAR) {
    return <Badge variant="outline">Sin importar</Badge>;
  }
  if (destino.decision === CREAR) {
    return (
      <Badge variant="outline" className="border-transparent bg-warning/15 text-warning">
        <Sparkles className="mr-1 size-3" />
        Nueva
      </Badge>
    );
  }
  if (destino.porRegla) {
    return (
      <Badge variant="outline" className="border-transparent bg-primary/12 text-primary">
        Aprendida
      </Badge>
    );
  }
  if (destino.confianza === 'sugerida') {
    return (
      <Badge variant="outline" className="border-transparent bg-warning/15 text-warning">
        A confirmar
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-transparent bg-income/12 text-income">
      Reconocida
    </Badge>
  );
}
