// Гүйлгээ нэмэх/устгахыг серверийн хариуг хүлээхгүйгээр жагсаалтад тусгана.
// Амжилтгүй бол өмнөх төлөвт буцаана. Түр id → жинхэнэ id, realtime давхардахгүй.

const KEY = { income: 'incomes', expense: 'expenses' };

const clone = (row) => ({ ...row });

export function txRollbackMessage(op, err) {
  const detail = err?.message ? ` (${err.message})` : '';
  const lead = op === 'delete' ? 'Устгаж чадсангүй' : 'Хадгалж чадсангүй';
  return `⚠️ ${lead}${detail}. Жагсаалт болон нийт дүнг өмнөх төлөвт буцаалаа.`;
}

function stableAlloc(alloc) {
  if (!alloc || typeof alloc !== 'object') return '';
  return JSON.stringify(Object.keys(alloc).sort().map((k) => [k, alloc[k]]));
}

function txSignature(kind, row) {
  const cat = kind === 'expense' ? (row.category || '') : (row.source || '');
  const acc = kind === 'expense' ? (row.account || '') : '';
  const alloc = kind === 'income' ? stableAlloc(row.alloc) : '';
  return [kind, row.date || '', Number(row.amount) || 0, cat, acc, row.note || '', row.created_by || '', alloc].join('\u001f');
}

export function optimisticAdd(state, { kind, fields, tempId, createdBy, createdAt }) {
  const key = KEY[kind];
  const row = {
    ...fields,
    id: tempId,
    tempId,
    pending: true,
    created_by: createdBy,
    created_at: createdAt,
    deleted: false,
    deleted_by: null,
    deleted_at: null,
  };
  return {
    incomes: (state.incomes || []).map(clone),
    expenses: (state.expenses || []).map(clone),
    pending: [...(state.pending || []), { op: 'add', tempId, kind, row }],
    [key]: [...(state[key] || []).map(clone), row],
  };
}

export function commitAdd(state, tempId, serverRow) {
  const pending = (state.pending || []).map((p) => ({ ...p }));
  const add = pending.find((p) => p.op === 'add' && p.tempId === tempId);
  if (!add) return state;
  const key = KEY[add.kind];
  const doomed = pending.some((p) => p.op === 'delete' && p.tempId === tempId);
  const rows = (state[key] || []).filter((r) => r.id !== tempId && r.id !== serverRow.id).map(clone);
  if (!doomed) rows.push({ ...serverRow, pending: false });
  const nextPending = [];
  for (const p of pending) {
    if (p.op === 'add' && p.tempId === tempId) continue;
    if (p.op === 'delete' && p.tempId === tempId) {
      nextPending.push({ ...p, id: serverRow.id, row: { ...serverRow, pending: false }, awaitingAdd: true });
    } else nextPending.push(p);
  }
  return {
    incomes: key === 'incomes' ? rows : (state.incomes || []).map(clone),
    expenses: key === 'expenses' ? rows : (state.expenses || []).map(clone),
    pending: nextPending,
  };
}

export function rollbackAdd(state, tempId) {
  const add = (state.pending || []).find((p) => p.op === 'add' && p.tempId === tempId);
  if (!add) return state;
  const key = KEY[add.kind];
  return {
    incomes: key === 'incomes' ? state.incomes.filter((r) => r.id !== tempId) : (state.incomes || []).map(clone),
    expenses: key === 'expenses' ? state.expenses.filter((r) => r.id !== tempId) : (state.expenses || []).map(clone),
    pending: state.pending.filter((p) => p.tempId !== tempId),
  };
}

export function optimisticDelete(state, kind, id) {
  const key = KEY[kind];
  const row = (state[key] || []).find((r) => r.id === id);
  if (!row) return state;
  const add = (state.pending || []).find((p) => p.op === 'add' && (p.tempId === id || p.realId === id));
  if (add) {
    return {
      incomes: key === 'incomes'
        ? state.incomes.filter((r) => r.id !== add.tempId && r.id !== add.realId && r.id !== id)
        : (state.incomes || []).map(clone),
      expenses: key === 'expenses'
        ? state.expenses.filter((r) => r.id !== add.tempId && r.id !== add.realId && r.id !== id)
        : (state.expenses || []).map(clone),
      pending: [
        ...(state.pending || []).filter((p) => !(p.op === 'add' && p.tempId === add.tempId)),
        { ...add, superseded: true },
        { op: 'delete', id: add.realId || id, tempId: add.tempId, kind, row: clone(row), awaitingAdd: true },
      ],
    };
  }
  return {
    incomes: key === 'incomes' ? state.incomes.filter((r) => r.id !== id).map(clone) : (state.incomes || []).map(clone),
    expenses: key === 'expenses' ? state.expenses.filter((r) => r.id !== id).map(clone) : (state.expenses || []).map(clone),
    pending: [...(state.pending || []).map((p) => ({ ...p })), { op: 'delete', id, kind, row: clone(row) }],
  };
}

export function commitDelete(state, id) {
  return {
    incomes: (state.incomes || []).map(clone),
    expenses: (state.expenses || []).map(clone),
    pending: (state.pending || []).filter((p) => !(p.op === 'delete' && (p.id === id || p.tempId === id))),
  };
}

export function rollbackDelete(state, id) {
  const p = (state.pending || []).find((x) => x.op === 'delete' && (x.id === id || x.tempId === id));
  if (!p) return state;
  const key = KEY[p.kind];
  const restored = { ...p.row, id: p.id || p.row.id, pending: false, deleted: false };
  const rows = (state[key] || []).map(clone);
  if (!rows.some((r) => r.id === restored.id)) rows.push(restored);
  return {
    incomes: key === 'incomes' ? rows : (state.incomes || []).map(clone),
    expenses: key === 'expenses' ? rows : (state.expenses || []).map(clone),
    pending: state.pending.filter((x) => x !== p),
  };
}

/**
 * Серверийн жагсаалт ирэхэд түр мөрийг жинхэнэ id-тай мөрөөр солино.
 * Хүлээгдэж буй устгалтыг сервер дээр харагдаж байсан ч нууна.
 */
export function reconcileTx(state, remote) {
  const pending = (state.pending || []).map((p) => ({ ...p, row: p.row ? { ...p.row } : p.row }));
  if (!pending.length) {
    return {
      incomes: [...(remote.incomes || [])],
      expenses: [...(remote.expenses || [])],
      pending,
    };
  }
  const next = { incomes: [], expenses: [], pending };
  for (const kind of ['income', 'expense']) {
    const key = KEY[kind];
    const local = state[key] || [];
    const known = new Set(local.filter((r) => !r.pending).map((r) => r.id));
    const remoteRows = [...(remote[key] || [])];
    const deletes = pending.filter((p) => p.op === 'delete' && p.kind === kind);
    const usedFresh = new Set();
    for (const del of deletes) {
      if (remoteRows.some((r) => r.id === del.id)) continue;
      const sig = txSignature(kind, del.row || {});
      const fresh = remoteRows.find((r) => !known.has(r.id) && !usedFresh.has(r.id) && txSignature(kind, r) === sig);
      if (fresh) {
        del.id = fresh.id;
        usedFresh.add(fresh.id);
      }
    }
    const hidden = new Set(deletes.map((p) => p.id));
    let rows = remoteRows.filter((r) => !hidden.has(r.id));
    const adds = pending.filter((p) => p.op === 'add' && p.kind === kind && !p.superseded);
    for (const add of adds) {
      let match = add.realId ? rows.find((r) => r.id === add.realId) : null;
      if (!match) {
        const sig = txSignature(kind, add.row || {});
        match = rows.find((r) => !known.has(r.id) && !usedFresh.has(r.id) && r.id !== add.tempId && txSignature(kind, r) === sig);
      }
      if (match) {
        add.realId = match.id;
        add.matched = true;
        usedFresh.add(match.id);
      }
    }
    for (const add of adds) {
      if (add.matched) continue;
      if (!rows.some((r) => r.id === add.tempId)) rows.push(add.row);
    }
    next[key] = rows;
  }
  return next;
}
