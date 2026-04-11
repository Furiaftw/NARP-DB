import { useState, useEffect, useMemo, useCallback } from 'react';

// ── Auth Token Helpers ──────────────────────────────────────────
const AUTH_TOKEN_KEY = 'narp_auth_token';
function getAuthToken() { return localStorage.getItem(AUTH_TOKEN_KEY); }
function setAuthToken(token) { localStorage.setItem(AUTH_TOKEN_KEY, token); }
function clearAuthToken() { localStorage.removeItem(AUTH_TOKEN_KEY); }
function authHeaders(extra = {}) {
  const token = getAuthToken();
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
}

// Map PostgreSQL snake_case user row to camelCase for frontend
const mapUser = (row) => row ? ({
  uid: row.id,
  email: row.email,
  role: row.role,
  status: row.status,
  nickname: row.nickname || null,
  allowedFactions: (() => { try { return JSON.parse(row.allowed_factions || '[]'); } catch { return []; } })(),
  createdAt: row.created_at,
}) : null;

// ============================================================
// CONFIG
// ============================================================
const DATA_API_URL = '/api/data';
const ADMIN_API_URL = '/api/db-admin';
const CACHE_KEY = 'narp_db_cache_v8';
const APP_VERSION = 'v6.0';
const APPROVALS_API_URL = '/api/db-approvals';
const SUPER_ADMIN_EMAIL = 'grisales4000@gmail.com';

const RANK_COST_MAP = { E: '1 CU', D: '2 CU', C: '4 CU', B: '6 CU', A: '8 CU', S: '10 CU' };

const SPECIALIZATION_OPTIONS = ['Bukijutsu', 'Fuinjutsu', 'Genjutsu', 'Medical Ninjutsu', 'Ninjutsu', 'Nintaijutsu', 'Taijutsu', 'Kinjutsu'];

const MANAGE_TABLES = {
  jutsus: { label: 'Jutsus', fields: [
    { key: 'name', label: 'Jutsu Name', required: true },
    { key: 'nature', label: 'Nature Type', type: 'multi-select', options: ['Fire', 'Water', 'Earth', 'Wind', 'Lightning', 'Yin', 'Yang', 'Sound', 'N/A'] },
    { key: 'rank', label: 'Rank', type: 'multi-select', options: ['E', 'D', 'C', 'B', 'A', 'S'] },
    { key: 'cost', label: 'Cost', hidden: true },
    { key: 'types', label: 'Jutsu Types', type: 'multi-select', options: ['1 Post', 'Continuous', 'Multi-Post'] },
    { key: 'origin', label: 'Origin', type: 'select', options: ['', 'Canon', 'Custom'] },
    { key: 'conditions', label: 'Conditions', type: 'multi-select', options: ['Must Learn IC', 'Limited'], optional: true },
    { key: 'specialization', label: 'Specialization', type: 'multi-select-editable', options: SPECIALIZATION_OPTIONS },
    { key: 'doc_link', label: 'Doc Link' },
    { key: 'bloodline', label: 'Bloodline', type: 'bloodline-select', optional: true },
    { key: 'secret_faction', label: 'Secret Faction', type: 'faction-select', optional: true },
    { key: 'staff_review', label: 'Staff Review Needed', type: 'checkbox' },
    { key: 'slots', label: 'Slots', type: 'slots', hidden_unless_includes: { field: 'conditions', value: 'Limited' } },
  ]},
  battlemodes: { label: 'Battlemodes', fields: [
    { key: 'name', label: 'Name', required: true },
    { key: 'category', label: 'Category', type: 'multi-select', options: ['Primary', 'Secondary', 'Tertiary'] },
    { key: 'bloodline', label: 'Bloodline', type: 'bloodline-select', optional: true },
    { key: 'nature', label: 'Nature(s)', type: 'multi-select', options: ['Fire', 'Water', 'Earth', 'Wind', 'Lightning', 'Yin', 'Yang', 'Sound', 'N/A'] },
    { key: 'doc_link', label: 'Doc Link' },
    { key: 'limited', label: 'Limited', type: 'checkbox' },
    { key: 'slots', label: 'Slots', type: 'slots', hidden_unless: 'limited' },
    { key: 'must_learn_ic', label: 'Must Learn IC', type: 'checkbox' },
  ]},
  clan_slots: { label: 'Limited Specs', fields: [
    { key: 'name', label: 'Name', required: true },
    { key: 'doc_link', label: 'Doc Link' },
    { key: 'slots', label: 'Slots', type: 'slots' },
  ]},
  bloodlines: { label: 'Bloodlines', fields: [
    { key: 'category', label: 'Category', type: 'select', options: ['', 'Canon', 'Custom'], required: true },
    { key: 'subcategory', label: 'Type', type: 'select', options: ['', 'KKG', 'Clan'], required: true },
    { key: 'name', label: 'Name', required: true },
    { key: 'doc_link', label: 'Google Doc Link' },
  ]},
  factions: { label: 'Factions', fields: [
    { key: 'name', label: 'Name', required: true },
  ]},
};

// ============================================================
// ICONS
// ============================================================
const Icon = ({ path, size = 24, className = "" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{path}</svg>
);
const Search = (p) => <Icon {...p} path={<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>} />;
const ExternalLink = (p) => <Icon {...p} path={<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>} />;
const Copy = (p) => <Icon {...p} path={<><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></>} />;
const Check = (p) => <Icon {...p} path={<path d="M20 6 9 17l-5-5" />} />;
const FilterIcon = (p) => <Icon {...p} path={<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />} />;
const ChevronDown = (p) => <Icon {...p} path={<path d="m6 9 6 6 6-6" />} />;
const ChevronUp = (p) => <Icon {...p} path={<path d="m18 15-6-6-6 6" />} />;
const TagIcon = (p) => <Icon {...p} path={<><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42l-8.704-8.704z" /><circle cx="7.5" cy="7.5" r=".5" fill="currentColor" /></>} />;
const BookOpen = (p) => <Icon {...p} path={<><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>} />;
const AlertCircle = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></>} />;
const Shield = (p) => <Icon {...p} path={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />} />;
const Key = (p) => <Icon {...p} path={<><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></>} />;
const LogOut = (p) => <Icon {...p} path={<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></>} />;
const CheckCircle = (p) => <Icon {...p} path={<><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>} />;
const Lock = (p) => <Icon {...p} path={<><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>} />;
const UsersIcon = (p) => <Icon {...p} path={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>} />;
const XCircle = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10" /><line x1="15" x2="9" y1="9" y2="15" /><line x1="9" x2="15" y1="9" y2="15" /></>} />;
const Clock = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>} />;
const RefreshCw = (p) => <Icon {...p} path={<><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></>} />;
const UserCheck = (p) => <Icon {...p} path={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></>} />;
const Swords = (p) => <Icon {...p} path={<><path d="M14.5 17.5 3 6V3h3l11.5 11.5" /><path d="M13 19l6-6" /><path d="m16 16 4 4" /><path d="m19 21 2-2" /><path d="M14.5 6.5 18 3h3v3l-3.5 3.5" /><path d="m5 14 4 4" /><path d="m7 17-3 3" /><path d="m3 19 2 2" /></>} />;
const Zap = (p) => <Icon {...p} path={<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />} />;
const Database = (p) => <Icon {...p} path={<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" /></>} />;
const PlusCircle = (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="16" /><line x1="8" x2="16" y1="12" y2="12" /></>} />;
const Edit2 = (p) => <Icon {...p} path={<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></>} />;
const Trash2 = (p) => <Icon {...p} path={<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></>} />;
const Save = (p) => <Icon {...p} path={<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></>} />;

// ============================================================
// CHECKBOX DROPDOWN COMPONENT
// ============================================================
function CheckboxDropdown({ label, options, selected, onChange, placeholder, allowAdd, onAddOption, onRemoveOption }) {
  const [open, setOpen] = useState(false);
  const [addInput, setAddInput] = useState('');
  const selectedArr = typeof selected === 'string' ? selected.split(',').map(s => s.trim()).filter(Boolean) : (Array.isArray(selected) ? selected : []);
  const dropdownRef = useState(null);

  const toggle = (opt) => {
    const newArr = selectedArr.includes(opt) ? selectedArr.filter(s => s !== opt) : [...selectedArr, opt];
    onChange(newArr.join(', '));
  };

  const handleAdd = () => {
    const val = addInput.trim();
    if (val && !options.includes(val)) {
      if (onAddOption) onAddOption(val);
      const newArr = [...selectedArr, val];
      onChange(newArr.join(', '));
      setAddInput('');
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-left flex items-center justify-between focus:ring-2 focus:ring-indigo-500 outline-none min-h-[42px]">
        <span className={selectedArr.length > 0 ? 'text-slate-800' : 'text-slate-400'}>
          {selectedArr.length > 0 ? selectedArr.join(', ') : placeholder || `Select ${label}...`}
        </span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
              <input type="checkbox" checked={selectedArr.includes(opt)} onChange={() => toggle(opt)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
              <span>{opt}</span>
              {allowAdd && onRemoveOption && !SPECIALIZATION_OPTIONS.includes(opt) && (
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveOption(opt); }} className="ml-auto text-red-400 hover:text-red-600 text-xs">remove</button>
              )}
            </label>
          ))}
          {allowAdd && (
            <div className="border-t border-slate-100 p-2 flex gap-2">
              <input type="text" value={addInput} onChange={e => setAddInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }}} placeholder="Add new..." className="flex-1 text-sm border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500" />
              <button type="button" onClick={handleAdd} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200">Add</button>
            </div>
          )}
          <div className="border-t border-slate-100 p-1">
            <button type="button" onClick={() => setOpen(false)} className="w-full text-xs text-slate-500 hover:text-slate-700 py-1 font-semibold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Slots editor component for limited items
function SlotsEditor({ value, onChange }) {
  const slots = (() => {
    try { return JSON.parse(value || '[]'); } catch { return []; }
  })();

  // If no slots exist yet, start with 1 empty slot
  const slotsArr = slots.length > 0 ? [...slots] : [{ discord_id: '', username: '' }];
  const filledCount = slotsArr.filter(s => s.discord_id && s.username).length;
  const totalSlots = slotsArr.length;
  const remainingSlots = totalSlots - filledCount;

  const updateSlot = (idx, field, val) => {
    const updated = [...slotsArr];
    updated[idx] = { ...updated[idx], [field]: val };
    onChange(JSON.stringify(updated));
  };

  const setSlotCount = (count) => {
    const num = Math.max(1, parseInt(count) || 1);
    const updated = [...slotsArr];
    while (updated.length < num) updated.push({ discord_id: '', username: '' });
    while (updated.length > num) updated.pop();
    onChange(JSON.stringify(updated));
  };

  const addSlot = () => {
    const updated = [...slotsArr, { discord_id: '', username: '' }];
    onChange(JSON.stringify(updated));
  };

  const removeSlot = (idx) => {
    if (slotsArr.length <= 1) return;
    const updated = slotsArr.filter((_, i) => i !== idx);
    onChange(JSON.stringify(updated));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1 gap-3">
        <span className="text-xs font-semibold text-slate-500">{filledCount}/{totalSlots} slots filled — {remainingSlots} remaining</span>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-500">Total Slots:</label>
          <input type="number" min="1" value={totalSlots} onChange={e => setSlotCount(e.target.value)} className="w-16 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 text-center" />
          <button type="button" onClick={addSlot} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-bold hover:bg-indigo-200">+ Add Slot</button>
        </div>
      </div>
      {slotsArr.map((slot, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <span className="text-xs text-slate-400 w-6 shrink-0">#{idx + 1}</span>
          <input type="text" value={slot.discord_id || ''} onChange={e => updateSlot(idx, 'discord_id', e.target.value)} placeholder="Discord ID" className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500" />
          <input type="text" value={slot.username || ''} onChange={e => updateSlot(idx, 'username', e.target.value)} placeholder="Username" className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500" />
          {slotsArr.length > 1 && (
            <button type="button" onClick={() => removeSlot(idx)} className="text-red-400 hover:text-red-600 text-xs p-1">x</button>
          )}
        </div>
      ))}
    </div>
  );
}

// Bloodline select dropdown with category filters
function BloodlineSelect({ value, onChange, manageRows, fetchRows }) {
  const [open, setOpen] = useState(false);
  const [bloodlines, setBloodlines] = useState([]);
  const [filterCat, setFilterCat] = useState('All');
  const [filterSub, setFilterSub] = useState('All');
  const [loading, setLoading] = useState(false);

  const loadBloodlines = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/db-admin?table=bloodlines');
      const json = await res.json();
      setBloodlines(json.rows || []);
    } catch (e) {
      setBloodlines([]);
    }
    setLoading(false);
  };

  const handleOpen = () => {
    if (!open) loadBloodlines();
    setOpen(!open);
  };

  const filtered = bloodlines.filter(b => {
    if (filterCat !== 'All' && b.category !== filterCat) return false;
    if (filterSub !== 'All' && b.subcategory !== filterSub) return false;
    return true;
  });

  const selectedArr = typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  return (
    <div className="relative">
      <button type="button" onClick={handleOpen} className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-left flex items-center justify-between focus:ring-2 focus:ring-indigo-500 outline-none min-h-[42px]">
        <span className={value ? 'text-slate-800' : 'text-slate-400'}>{value || 'Select Bloodline...'}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 flex gap-1 flex-wrap">
            {['All', 'Canon', 'Custom'].map(c => (
              <button key={c} type="button" onClick={() => setFilterCat(c)} className={`text-xs px-2 py-0.5 rounded font-bold ${filterCat === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c}</button>
            ))}
            <span className="text-slate-300 mx-1">|</span>
            {['All', 'KKG', 'Clan'].map(s => (
              <button key={s} type="button" onClick={() => setFilterSub(s)} className={`text-xs px-2 py-0.5 rounded font-bold ${filterSub === s ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{s}</button>
            ))}
          </div>
          <div className="overflow-y-auto max-h-48">
            {loading ? (
              <div className="p-3 text-xs text-slate-400 text-center">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-3 text-xs text-slate-400 text-center">No bloodlines found</div>
            ) : (
              filtered.map(b => (
                <button key={b.id} type="button" onClick={() => { onChange(b.name); setOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between ${value === b.name ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}`}>
                  <span>{b.name}</span>
                  <span className="text-[10px] text-slate-400">{b.category} {b.subcategory || ''}</span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 p-1 flex gap-1">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="flex-1 text-xs text-slate-400 hover:text-slate-600 py-1 font-semibold">Clear</button>
            <button type="button" onClick={() => setOpen(false)} className="flex-1 text-xs text-slate-500 hover:text-slate-700 py-1 font-semibold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Faction multi-select dropdown
function FactionSelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [factionsList, setFactionsList] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFactions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/db-admin?table=factions');
      const json = await res.json();
      setFactionsList((json.rows || []).map(r => r.name));
    } catch (e) {
      setFactionsList([]);
    }
    setLoading(false);
  };

  const handleOpen = () => {
    if (!open) loadFactions();
    setOpen(!open);
  };

  const selectedArr = typeof value === 'string' ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  const toggle = (f) => {
    const newArr = selectedArr.includes(f) ? selectedArr.filter(s => s !== f) : [...selectedArr, f];
    onChange(newArr.join(', '));
  };

  return (
    <div className="relative">
      <button type="button" onClick={handleOpen} className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-left flex items-center justify-between focus:ring-2 focus:ring-indigo-500 outline-none min-h-[42px]">
        <span className={selectedArr.length > 0 ? 'text-slate-800' : 'text-slate-400'}>{selectedArr.length > 0 ? selectedArr.join(', ') : 'Select Factions...'}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {loading ? (
            <div className="p-3 text-xs text-slate-400 text-center">Loading...</div>
          ) : factionsList.length === 0 ? (
            <div className="p-3 text-xs text-slate-400 text-center">No factions found</div>
          ) : (
            factionsList.map(f => (
              <label key={f} className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 cursor-pointer text-sm">
                <input type="checkbox" checked={selectedArr.includes(f)} onChange={() => toggle(f)} className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                <span>{f}</span>
              </label>
            ))
          )}
          <div className="border-t border-slate-100 p-1">
            <button type="button" onClick={() => setOpen(false)} className="w-full text-xs text-slate-500 hover:text-slate-700 py-1 font-semibold">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// STATIC CONSTANTS
// ============================================================
const NATURES = ["Fire", "Water", "Lightning", "Earth", "Wind", "Yang", "Yin", "Sound"];
const JUTSU_TYPES = ["1 Post", "Continuous", "Multi-Post"];
const RANKS = ["E", "D", "C", "B", "A", "S"];
const ORIGIN = ["Canon", "Custom"];
const BATTLEMODE_CATEGORIES = ["Tertiary", "Secondary", "Primary"];

const getBattlemodeColor = (category) => {
  const colors = {
    "Tertiary": "bg-teal-100 text-teal-800 border-teal-200",
    "Secondary": "bg-amber-100 text-amber-800 border-amber-200",
    "Primary": "bg-rose-100 text-rose-800 border-rose-200",
  };
  return colors[category] || "bg-slate-200 text-slate-800 border-slate-300";
};

const getNatureColor = (nature) => {
  const colors = {
    "Fire": "bg-orange-100 text-orange-800 border-orange-200",
    "Water": "bg-blue-100 text-blue-800 border-blue-200",
    "Lightning": "bg-yellow-200 text-yellow-900 border-yellow-300",
    "Earth": "bg-red-900 text-red-100 border-red-800",
    "Wind": "bg-green-100 text-green-800 border-green-200",
    "Yang": "bg-amber-100 text-amber-900 border-amber-300",
    "Yin": "bg-purple-100 text-purple-900 border-purple-300",
    "Sound": "bg-pink-100 text-pink-800 border-pink-200",
  };
  return colors[nature] || "bg-slate-200 text-slate-800 border-slate-300";
};
// ============================================================
// HELPERS
// ============================================================
function toArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.trim() !== '') return val.split(',').map(s => s.trim()).filter(Boolean);
  return [];
}

// ============================================================
// DATA FETCHING
// ============================================================
function deriveClanCategory(bloodlineName, bloodlineDb) {
  if (!bloodlineName || bloodlineName === '') return 'None';
  for (const [cat, names] of Object.entries(bloodlineDb)) {
    if (names.includes(bloodlineName)) return cat;
  }
  return 'None';
}

// Helper: find a value from an object trying multiple key names (case-insensitive)
function getVal(obj, ...candidates) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const c of candidates) {
    if (obj[c] !== undefined && obj[c] !== null) return obj[c];
  }
  // Fallback: case-insensitive search
  const keys = Object.keys(obj);
  for (const c of candidates) {
    const lower = c.toLowerCase().replace(/[\s_-]/g, '');
    const match = keys.find(k => k.toLowerCase().replace(/[\s_-]/g, '') === lower);
    if (match && obj[match] !== undefined && obj[match] !== null) return obj[match];
  }
  return undefined;
}

// Helper: get string value from a row, trying multiple column names
function getStr(row, ...candidates) {
  const val = getVal(row, ...candidates);
  return val !== undefined && val !== null ? String(val).trim() : '';
}

// Load data from localStorage cache only (no API call)
function loadCachedData() {
  // Clear any old cache keys from previous versions
  try { localStorage.removeItem('narp_jutsu_cache'); } catch(e) {}
  for (let i = 2; i <= 7; i++) {
    try { localStorage.removeItem(`narp_db_cache_v${i}`); } catch(e) {}
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      console.log('[NARP] Loaded cached data. Battlemodes:', (parsed.battlemodes || []).length, 'ClanSlots:', (parsed.clanSlots || []).length);
      return parsed;
    }
  } catch (e) { }
  return null;
}

// Fetch fresh data from API (admin-only action) and process it
async function fetchFreshData() {
  const res = await fetch(DATA_API_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const json = await res.json();
  console.log('[NARP] API response keys:', Object.keys(json));
  if (json.error) throw new Error(json.error);

  const bloodlines = getVal(json, 'bloodlines', 'Bloodlines') || {};
  const factions = getVal(json, 'factions', 'Factions') || [];

  // Clan slots — try multiple possible key names from the API
  const rawClanSlots = getVal(json, 'clanSlots', 'clanslots', 'clan_slots', 'ClanSlots', 'Clan Slots') || [];
  console.log('[NARP] Raw clan slots from API:', rawClanSlots.length, 'sample:', rawClanSlots[0] ? Object.keys(rawClanSlots[0]) : 'none');
  const clanSlots = rawClanSlots.map(slot => {
    const name = getStr(slot, 'name', 'Name', 'Clan', 'Clan Name', 'ClanName', 'Item', 'Item Name');
    if (!name) return null;
    // Availability: check multiple column names and value patterns
    const availRaw = getStr(slot, 'available', 'Available', 'Status', 'Availability', 'AvailableSlot');
    const availLower = availRaw.toLowerCase();
    // If it's a boolean true/false in the data
    const availBool = getVal(slot, 'available', 'Available');
    let isAvailable;
    if (typeof availBool === 'boolean') {
      isAvailable = availBool;
    } else if (availLower === 'n/a' || availLower === 'no' || availLower === 'unavailable' || availLower === 'closed' || availLower === 'taken' || availLower === 'full' || availLower === '0' || availLower === 'false') {
      isAvailable = false;
    } else if (availLower === '' && availRaw === '') {
      // No availability info — default to available
      isAvailable = true;
    } else {
      isAvailable = true;
    }
    const link = getStr(slot, 'link', 'Link', 'Doc', 'Doc Link', 'DocLink', 'URL');
    const slotsData = getStr(slot, 'Slots', 'slots');
    return { name, available: isAvailable, link, slots: slotsData };
  }).filter(Boolean);

  // Jutsus — try multiple possible key names
  const rawJutsus = getVal(json, 'jutsus', 'Jutsus', 'jutsu', 'Jutsu') || [];
  const jutsus = rawJutsus.map((row, idx) => {
    const rankStr = getStr(row, 'Rank', 'rank', 'Ranks');
    const rankArr = rankStr.split(',').map(r => r.trim()).filter(Boolean);
    const conditions = getStr(row, 'Conditions', 'conditions', 'Condition').toLowerCase();
    const secretStr = getStr(row, 'Secret Faction', 'SecretFaction', 'Secret', 'secret faction');
    const secretFactions = secretStr.split(',').map(f => f.trim()).filter(Boolean);
    const bloodlineName = getStr(row, 'Bloodline', 'bloodline', 'Bloodline/KKG', 'Clan');

    return {
      _id: `jutsu-${idx}`,
      name: getStr(row, 'Ability Name', 'AbilityName', 'Name', 'name', 'Jutsu Name', 'JutsuName'),
      nature: getStr(row, 'Nature Type', 'NatureType', 'Nature', 'nature'),
      rank: rankArr,
      cost: getStr(row, 'Cost', 'cost'),
      types: getStr(row, 'Jutsu Types', 'JutsuTypes', 'Type', 'Types', 'jutsu types').split(',').map(t => t.trim()).filter(Boolean),
      origin: getStr(row, 'Origin', 'origin'),
      spec: getStr(row, 'Specialization', 'specialization', 'Spec', 'spec').split(',').map(s => s.trim()).filter(Boolean),
      link: getStr(row, 'Doc Link', 'DocLink', 'Link', 'link', 'Doc', 'URL'),
      clanCat: deriveClanCategory(bloodlineName, bloodlines),
      clanName: bloodlineName || 'None',
      limited: conditions.includes('limited'),
      mustLearnIC: conditions.includes('learn ic'),
      secret: secretFactions.length > 0,
      secretFactions,
      multiRank: rankArr.length > 1,
      staffReview: getStr(row, 'Staff Review', 'staff_review', 'StaffReview') === 'Yes',
      slots: getStr(row, 'Slots', 'slots'),
    };
  });

  // Process battlemodes from API — try multiple key names
  const rawBattlemodes = getVal(json, 'battlemodes', 'Battlemodes', 'battleModes', 'BattleModes', 'battle_modes', 'Battlemode') || [];
  console.log('[NARP] Raw battlemodes from API:', rawBattlemodes.length, 'sample:', rawBattlemodes[0] ? Object.keys(rawBattlemodes[0]) : 'none');
  if (rawBattlemodes.length === 0) {
    console.warn('[NARP] No battlemodes data found in API response.');
  }

  const battlemodes = rawBattlemodes.map((row, idx) => {
    const name = getStr(row, 'Name', 'name', 'Battlemode Name', 'BattlemodeName', 'BM Name', 'Battlemode');
    if (!name) return null;
    const category = getStr(row, 'Type', 'type', 'Category', 'category');
    const rawClan = getStr(row, 'Bloodline/Hidden', 'Bloodline/KKG/Clan', 'Bloodline/KKG', 'Clan', 'clan', 'Bloodline', 'bloodline', 'KKG', 'Hidden');
    const clan = (rawClan.toLowerCase() === 'n/a' || rawClan.toLowerCase() === 'none') ? '' : rawClan;
    const rawNature = getStr(row, 'Nature(s)', 'Natures', 'Nature', 'nature', 'Nature Type', 'NatureType');
    const nature = (rawNature.toLowerCase() === 'n/a' || rawNature.toLowerCase() === 'none') ? '' : rawNature;
    const link = getStr(row, 'Doc', 'Doc Link', 'DocLink', 'Link', 'link', 'URL');
    const limitedVal = getStr(row, 'Limited', 'limited', 'Limited Slots', 'LimitedSlots').toLowerCase();
    const hasLimitedSlots = limitedVal === 'yes' || limitedVal === 'true' || limitedVal === 'limited';
    // Read availability
    const availableVal = getStr(row, 'Available', 'available', 'AvailableSlot', 'Availability', 'Status');
    const availLower = availableVal.toLowerCase();
    const isAvailable = hasLimitedSlots
      ? (!!availableVal && availLower !== 'n/a' && availLower !== '0' && availLower !== 'no' && availLower !== 'unavailable' && availLower !== 'closed' && availLower !== 'taken' && availLower !== 'full' && availLower !== 'false')
      : (availLower !== 'no' && availLower !== 'unavailable' && availLower !== 'closed' && availLower !== 'false');

    return {
      _id: `bm-${idx}`,
      name,
      category,
      clan,
      nature,
      link,
      limitedSlots: hasLimitedSlots,
      available: isAvailable,
      mustLearnIC: getStr(row, 'Must Learn IC', 'must_learn_ic', 'MustLearnIC').toLowerCase() === 'yes',
      slots: getStr(row, 'Slots', 'slots'),
    };
  }).filter(Boolean);

  console.log('[NARP] Processed battlemodes:', battlemodes.length);
  console.log('[NARP] Processed clan slots:', clanSlots.length);

  // Store raw API response for admin debug tab
  const rawApiResponse = { ...json, _fetchedAt: new Date().toISOString() };

  const result = { jutsus, bloodlines, factions, clanSlots, battlemodes, rawApiResponse, ts: Date.now() };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch (e) { }
  return result;
}

// ============================================================
// MAIN APP
// ============================================================
function App() {
  const [jutsus, setJutsus] = useState([]);
  const [bloodlines, setBloodlines] = useState({});
  const [factions, setFactions] = useState([]);
  const [clanSlots, setClanSlots] = useState([]);
  const [battlemodes, setBattlemodes] = useState([]);
  const [rawApiData, setRawApiData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);

  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);

  const [view, setView] = useState('browser');

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [fNature, setFNature] = useState('Any');
  const [fOrigin, setFOrigin] = useState('Any');
  const [fSpec, setFSpec] = useState('Any');
  const [fType, setFType] = useState('Any');
  const [fRank, setFRank] = useState('Any');
  const [fClanCat, setFClanCat] = useState('Any');
  const [fClanName, setFClanName] = useState('Any');
  const [fLimited, setFLimited] = useState(false);
  const [fMultiRank, setFMultiRank] = useState(false);
  const [fActiveSecrets, setFActiveSecrets] = useState([]);

  const [clanSearch, setClanSearch] = useState('');
  const [bmSearch, setBmSearch] = useState('');
  const [fBmCategory, setFBmCategory] = useState('Any');

  const loginTab = 'user';
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginMessage, setLoginMessage] = useState(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // Manage Data panel state
  const [manageTable, setManageTable] = useState('jutsus');
  const [manageRows, setManageRows] = useState([]);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageError, setManageError] = useState(null);
  const [manageSuccess, setManageSuccess] = useState(null);
  const [editingRow, setEditingRow] = useState(null); // null = not editing, {} = new row, {id: ...} = editing existing
  const [formData, setFormData] = useState({});
  const [customCost, setCustomCost] = useState(false);
  const [manageSearch, setManageSearch] = useState('');
  const [customSpecs, setCustomSpecs] = useState([]);

  // Approval system state
  const [pendingEntries, setPendingEntries] = useState([]);
  const [pendingFactionRequests, setPendingFactionRequests] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);

  const CLAN_CATEGORIES = useMemo(() => Object.keys(bloodlines), [bloodlines]);
  const ALL_FACTIONS = useMemo(() => factions, [factions]);
  const SPECIALIZATIONS = useMemo(() => {
    const specs = new Set(jutsus.flatMap(j => toArray(j.spec)));
    return [...specs].sort();
  }, [jutsus]);

  const visibleFactions = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'admin' || currentUser.role === 'staff') return ALL_FACTIONS;
    return currentUser.allowedFactions || [];
  }, [currentUser, ALL_FACTIONS]);

  const filteredClans = useMemo(() => {
    if (!clanSearch.trim()) return clanSlots;
    return clanSlots.filter(c => c.name.toLowerCase().includes(clanSearch.toLowerCase()));
  }, [clanSlots, clanSearch]);

  const filteredBattlemodes = useMemo(() => {
    return battlemodes.filter(bm => {
      const matchSearch = !bmSearch.trim() || bm.name.toLowerCase().includes(bmSearch.toLowerCase());
      const matchCategory = fBmCategory === 'Any' || bm.category === fBmCategory;
      return matchSearch && matchCategory;
    });
  }, [battlemodes, bmSearch, fBmCategory]);

  // On mount, fetch data from server cache (available to all users)
  useEffect(() => {
    const loadData = async () => {
      // Try localStorage first for instant display
      const cached = loadCachedData();
      if (cached && cached.jutsus && cached.jutsus.length > 0) {
        setJutsus(cached.jutsus || []);
        setBloodlines(cached.bloodlines || {});
        setFactions(cached.factions || []);
        setClanSlots(cached.clanSlots || []);
        setBattlemodes(cached.battlemodes || []);
        setRawApiData(cached.rawApiResponse || null);
      }
      // Then fetch from server to get the latest admin-refreshed data
      try {
        const data = await fetchFreshData();
        setJutsus(data.jutsus);
        setBloodlines(data.bloodlines);
        setFactions(data.factions);
        setClanSlots(data.clanSlots || []);
        setBattlemodes(data.battlemodes || []);
        setRawApiData(data.rawApiResponse || null);
      } catch (err) {
        // If server fetch fails but we have cached data, that's fine
        if (!cached || !cached.jutsus || cached.jutsus.length === 0) {
          setDataError(err.message);
        }
      }
      setDataLoading(false);
    };
    loadData();
  }, []);

  // Fetch user profile from PostgreSQL using auth token
  const fetchUserProfile = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { headers: authHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      return mapUser(data);
    } catch { return null; }
  }, []);

  // Fetch all users for admin panel
  const fetchAllUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users-admin', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setAllUsers(data.map(mapUser));
    } catch (err) {
      console.error('Fetch users error:', err);
    }
  }, []);

  // Check auth state on mount using stored token
  useEffect(() => {
    const checkAuth = async () => {
      const token = getAuthToken();
      if (token) {
        const profile = await fetchUserProfile();
        if (profile && profile.status === 'approved') {
          setCurrentUser(profile);
        } else {
          clearAuthToken();
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    };
    checkAuth();
  }, [fetchUserProfile]);

  useEffect(() => {
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'staff') { setAllUsers([]); return; }
    fetchAllUsers();
  }, [currentUser?.role, fetchAllUsers]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginMessage(null);
    setLoginLoading(true);
    const email = emailInput.toLowerCase().trim();

    try {
      if (isRequesting) {
        // Register a new account
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: passwordInput }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Unable to register.');
        }
        // If super admin, auto-login with returned token
        if (data.token) {
          setAuthToken(data.token);
          const profile = mapUser(data.user);
          setCurrentUser(profile);
          setLoginMessage(null);
          setView('admin_dashboard');
        } else {
          setLoginMessage({ type: data.status === 'approved' ? 'success' : 'pending', text: data.message || 'Account created.' });
        }
        setIsRequesting(false);
        setPasswordInput('');
      } else {
        // Login with email/password
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: passwordInput }),
        });
        const data = await res.json();

        if (!res.ok) {
          if (data.status === 'pending') {
            setLoginMessage({ type: 'pending', text: data.error });
          } else {
            throw new Error(data.error || 'Login failed.');
          }
          return;
        }

        setAuthToken(data.token);
        const profile = mapUser(data.user);
        setCurrentUser(profile);
        setLoginMessage(null);
        setView(profile.role === 'admin' ? 'admin_dashboard' : profile.role === 'staff' ? 'manage_data' : 'browser');
      }
    } catch (err) {
      setLoginMessage({ type: 'error', text: err.message || 'An error occurred.' });
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    setCurrentUser(null);
    setEmailInput(''); setPasswordInput('');
    setLoginMessage(null); setFActiveSecrets([]);
    setIsRequesting(false); setView('browser');
  };

  const handleUpdateUserStatus = async (uid, newStatus) => {
    try {
      const res = await fetch('/api/users-admin?action=update_status', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ uid, status: newStatus })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchAllUsers();
    } catch (err) { console.error('Update status error:', err); }
  };

  const handleDeleteAccount = async (uid, email) => {
    if (!confirm(`Permanently delete account "${email}"? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/delete-user', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ targetUid: uid })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete account');
      await fetchAllUsers();
    } catch (err) {
      console.error('Delete account error:', err);
      alert('Failed to delete account: ' + err.message);
    }
  };

  const handleSetNickname = async (uid, nickname) => {
    try {
      const res = await fetch('/api/users-admin?action=update_nickname', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ uid, nickname: nickname.trim() || null })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchAllUsers();
    } catch (err) { console.error('Set nickname error:', err); }
  };

  const handleToggleFaction = async (uid, faction) => {
    try {
      const res = await fetch('/api/users-admin?action=toggle_faction', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ uid, faction })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchAllUsers();
    } catch (err) { console.error('Toggle faction error:', err); }
  };

  const handleChangeUserRole = async (uid, newRole) => {
    try {
      const res = await fetch('/api/users-admin?action=update_role', {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ uid, role: newRole })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await fetchAllUsers();
    } catch (err) { console.error('Change role error:', err); }
  };

  const canPromote = (targetRole, targetEmail) => {
    if (!currentUser) return [];
    const isSuperAdmin = currentUser.email === SUPER_ADMIN_EMAIL;
    if (isSuperAdmin) {
      // Super admin can promote/demote anyone to any level
      if (targetRole === 'user') return ['staff', 'admin'];
      if (targetRole === 'staff') return ['admin'];
      if (targetRole === 'admin') return []; // already highest (below super)
      return [];
    }
    if (currentUser.role === 'admin') {
      // Admin can promote users to staff only
      if (targetRole === 'user') return ['staff'];
      return [];
    }
    return [];
  };

  const canDemote = (targetRole, targetEmail) => {
    if (!currentUser) return [];
    const isSuperAdmin = currentUser.email === SUPER_ADMIN_EMAIL;
    if (isSuperAdmin) {
      if (targetRole === 'admin' && targetEmail !== SUPER_ADMIN_EMAIL) return ['staff', 'user'];
      if (targetRole === 'staff') return ['user'];
      return [];
    }
    if (currentUser.role === 'admin') {
      // Standard admins can demote staff to user, cannot demote other admins
      if (targetRole === 'staff') return ['user'];
      return [];
    }
    return [];
  };

  // Fetch pending approvals
  const fetchPendingApprovals = async () => {
    setApprovalsLoading(true);
    try {
      const res = await fetch(`${APPROVALS_API_URL}?action=all_pending`);
      const data = await res.json();
      if (res.ok) {
        setPendingEntries(data.pending_entries || []);
        setPendingFactionRequests(data.pending_faction_requests || []);
      }
    } catch (err) {
      console.error('Fetch approvals error:', err);
    }
    setApprovalsLoading(false);
  };

  // Submit a pending jutsu entry (for staff)
  const handleSubmitPendingEntry = async (tableName, entryData) => {
    try {
      const res = await fetch(`${APPROVALS_API_URL}?action=submit_entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_name: tableName,
          entry_data: entryData,
          submitted_by_email: currentUser.email,
          submitted_by_role: currentUser.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submit failed');
      return data;
    } catch (err) {
      throw err;
    }
  };

  // Resolve a pending entry (approve/deny)
  const handleResolveEntry = async (id, decision) => {
    try {
      const res = await fetch(`${APPROVALS_API_URL}?action=resolve_entry&id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          approved_by_email: currentUser.email,
          approved_by_role: currentUser.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resolve failed');
      await fetchPendingApprovals();
      return data;
    } catch (err) {
      throw err;
    }
  };

  // Request faction access (staff submits for approval)
  const handleRequestFactionAccess = async (targetUid, targetEmail, faction) => {
    try {
      const res = await fetch(`${APPROVALS_API_URL}?action=request_faction_access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_uid: targetUid,
          target_email: targetEmail,
          faction,
          requested_by_email: currentUser.email,
          requested_by_role: currentUser.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (data.bypass) {
        // Admin can grant directly
        await handleToggleFaction(targetUid, faction);
        return { direct: true };
      }
      await fetchPendingApprovals();
      return data;
    } catch (err) {
      throw err;
    }
  };

  // Resolve a faction access request
  const handleResolveFactionRequest = async (id, decision) => {
    try {
      const res = await fetch(`${APPROVALS_API_URL}?action=resolve_faction_request&id=${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          approved_by_email: currentUser.email,
          approved_by_role: currentUser.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resolve failed');
      // If approved, grant the actual access
      if (data.grant_access) {
        await handleToggleFaction(data.target_uid, data.faction);
      }
      await fetchPendingApprovals();
      return data;
    } catch (err) {
      throw err;
    }
  };

  // Clear [Admin Approval Pending] tag
  const handleClearAdminPending = async (rowId, tableName) => {
    try {
      const res = await fetch(`${APPROVALS_API_URL}?action=clear_admin_pending&id=0`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ row_id: rowId, table_name: tableName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clear failed');
      await fetchManageRows(manageTable);
      return data;
    } catch (err) {
      throw err;
    }
  };

  const handleCopyLink = (link, id) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {
      const ta = document.createElement("textarea"); ta.value = link;
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } catch (e) { }
      document.body.removeChild(ta);
    });
  };

  const handleForceRefresh = async () => {
    if (currentUser?.role !== 'admin') return; // Only admins can refresh
    setDataLoading(true);
    setDataError(null);
    localStorage.removeItem(CACHE_KEY);
    try {
      // POST to /api/data-refresh which updates the server-side cache for everyone
      const res = await fetch('/api/data-refresh', { method: 'POST' });
      if (!res.ok) throw new Error(`Refresh failed: ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      // Re-fetch via the shared fetchFreshData so data is processed consistently
      // (proper arrays for rank/types/spec, derived fields like secret, clanCat, etc.)
      const data = await fetchFreshData();
      setJutsus(data.jutsus);
      setBloodlines(data.bloodlines);
      setFactions(data.factions);
      setClanSlots(data.clanSlots || []);
      setBattlemodes(data.battlemodes || []);
      setRawApiData(data.rawApiResponse || null);
      setDataError(null);
    } catch (err) { setDataError(err.message); }
    setDataLoading(false);
  };

  // --- Manage Data functions ---
  const fetchManageRows = async (table) => {
    setManageLoading(true);
    setManageError(null);
    try {
      const res = await fetch(`${ADMIN_API_URL}?table=${table}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch');
      setManageRows(json.rows || []);
    } catch (err) {
      setManageError(err.message);
      setManageRows([]);
    }
    setManageLoading(false);
  };

  const handleManageTableChange = (table) => {
    setManageTable(table);
    setEditingRow(null);
    setFormData({});
    setManageSearch('');
    setManageSuccess(null);
    setManageError(null);
    fetchManageRows(table);
  };

  const handleStartAdd = () => {
    const empty = {};
    MANAGE_TABLES[manageTable].fields.forEach(f => {
      if (f.type === 'slots') {
        empty[f.key] = JSON.stringify([
          { discord_id: '', username: '' },
        ]);
      } else {
        empty[f.key] = '';
      }
    });
    setFormData(empty);
    setEditingRow({});
    setCustomCost(false);
    setManageSuccess(null);
    setManageError(null);
  };

  const handleStartEdit = (row) => {
    const data = {};
    MANAGE_TABLES[manageTable].fields.forEach(f => { data[f.key] = row[f.key] || ''; });
    setFormData(data);
    setEditingRow(row);
    // Detect if existing cost differs from rank-based auto cost
    if (manageTable === 'jutsus') {
      const ranks = (data.rank || '').split(',').map(r => r.trim()).filter(Boolean);
      if (ranks.length === 1 && RANK_COST_MAP[ranks[0]]) {
        setCustomCost(data.cost !== '' && data.cost !== RANK_COST_MAP[ranks[0]]);
      } else if (ranks.length > 1) {
        const autoCost = ranks.map(r => RANK_COST_MAP[r]).filter(Boolean).join(' / ');
        setCustomCost(data.cost !== '' && data.cost !== autoCost);
      } else {
        setCustomCost(data.cost !== '' && !data.rank);
      }
    } else {
      setCustomCost(false);
    }
    setManageSuccess(null);
    setManageError(null);
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setFormData({});
    setCustomCost(false);
  };

  const handleSaveRow = async () => {
    setManageLoading(true);
    setManageError(null);
    setManageSuccess(null);
    try {
      const isNew = !editingRow.id;
      const url = isNew
        ? `${ADMIN_API_URL}?table=${manageTable}`
        : `${ADMIN_API_URL}?table=${manageTable}&id=${editingRow.id}`;
      const payload = { ...formData };

      // Auto-calculate cost from rank for jutsus unless custom cost is enabled
      if (manageTable === 'jutsus' && !customCost) {
        const ranks = (payload.rank || '').split(',').map(r => r.trim()).filter(Boolean);
        if (ranks.length === 1 && RANK_COST_MAP[ranks[0]]) {
          payload.cost = RANK_COST_MAP[ranks[0]];
        } else if (ranks.length > 1) {
          // Multi-rank: show range or highest
          const costs = ranks.map(r => RANK_COST_MAP[r]).filter(Boolean);
          payload.cost = costs.length > 0 ? costs.join(' / ') : '';
        }
      }

      // For battlemodes with limited checked, compute available from slots
      if (manageTable === 'battlemodes' && payload.limited === 'Yes') {
        try {
          const slots = JSON.parse(payload.slots || '[]');
          const filledCount = slots.filter(s => s.discord_id && s.username).length;
          const totalSlots = slots.length;
          payload.available = filledCount < totalSlots ? 'Yes' : 'No';
        } catch { payload.available = 'Yes'; }
      } else if (manageTable === 'battlemodes' && payload.limited !== 'Yes') {
        payload.available = 'Yes';
        payload.slots = '';
      }

      // For clan_slots (Limited Specs), compute available from slots
      if (manageTable === 'clan_slots') {
        try {
          const slots = JSON.parse(payload.slots || '[]');
          const filledCount = slots.filter(s => s.discord_id && s.username).length;
          const totalSlots = slots.length;
          payload.available = filledCount < totalSlots ? 'Yes' : 'No';
        } catch { payload.available = 'Yes'; }
      }

      // Handle category multi-select for battlemodes: auto add [Bundle] tag logic
      if (manageTable === 'battlemodes') {
        const cats = (payload.category || '').split(',').map(c => c.trim()).filter(Boolean);
        if (cats.length > 1 && !cats.includes('Bundle')) {
          payload.category = [...cats, 'Bundle'].join(', ');
        }
      }

      // Staff review checkbox for jutsus
      if (manageTable === 'jutsus') {
        payload.staff_review = payload.staff_review === 'Yes' ? 'Yes' : '';
        // For jutsus with Limited condition, handle slots
        const conditions = (payload.conditions || '').split(',').map(c => c.trim());
        if (conditions.includes('Limited')) {
          // Slots are present, no extra action needed — slots field is already in payload
        } else {
          // Clear slots when not limited
          payload.slots = '';
        }
      }

      // Must learn IC checkbox for battlemodes
      if (manageTable === 'battlemodes') {
        payload.must_learn_ic = payload.must_learn_ic === 'Yes' ? 'Yes' : '';
      }

      // Staff submitting to jutsu-like tables must go through approval
      if (currentUser?.role === 'staff' && isNew) {
        try {
          const result = await handleSubmitPendingEntry(manageTable, payload);
          setManageSuccess('Draft submitted for approval! An Admin or another Staff member must approve before it is published.');
          setEditingRow(null);
          setFormData({});
          setManageLoading(false);
          return;
        } catch (err) {
          setManageError(err.message);
          setManageLoading(false);
          return;
        }
      }

      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');

      let successMsg = isNew ? 'Item added successfully!' : 'Item updated successfully!';

      // Auto-insert into Limited Specs when creating a bloodline
      if (manageTable === 'bloodlines' && isNew && payload.doc_link) {
        try {
          const defaultSlots = JSON.stringify([
            { discord_id: '', username: '' },
            { discord_id: '', username: '' },
            { discord_id: '', username: '' },
            { discord_id: '', username: '' },
          ]);
          await fetch(`${ADMIN_API_URL}?table=clan_slots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: payload.name,
              doc_link: payload.doc_link,
              available: 'Yes',
              slots: defaultSlots,
            }),
          });
          successMsg += ' Also added to Limited Specs with 4 default slots.';
        } catch (e) {
          successMsg += ' (Warning: Failed to auto-add to Limited Specs)';
        }
      }

      setManageSuccess(successMsg);
      setEditingRow(null);
      setFormData({});
      await fetchManageRows(manageTable);
    } catch (err) {
      setManageError(err.message);
    }
    setManageLoading(false);
  };

  const handleDeleteRow = async (id) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    setManageLoading(true);
    setManageError(null);
    setManageSuccess(null);
    try {
      const res = await fetch(`${ADMIN_API_URL}?table=${manageTable}&id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setManageSuccess('Item deleted successfully!');
      await fetchManageRows(manageTable);
    } catch (err) {
      setManageError(err.message);
    }
    setManageLoading(false);
  };

  // Load manage rows when switching to manage view
  useEffect(() => {
    if (view === 'manage_data' && (currentUser?.role === 'admin' || currentUser?.role === 'staff')) {
      fetchManageRows(manageTable);
    }
  }, [view]);

  // Load pending approvals when viewing admin dashboard
  useEffect(() => {
    if ((view === 'admin_dashboard' || view === 'manage_data') && (currentUser?.role === 'admin' || currentUser?.role === 'staff')) {
      fetchPendingApprovals();
    }
  }, [view, currentUser?.role]);

  const filteredJutsus = useMemo(() => {
    const secretModeActive = fActiveSecrets.length > 0;

    return jutsus.filter(j => {
      if (secretModeActive) {
        if (!j.secret) return false;
        if (!j.secretFactions || !j.secretFactions.some(f => fActiveSecrets.includes(f))) return false;
      } else {
        if (j.secret) return false;
      }

      const specArr = toArray(j.spec);
      const rankArr = toArray(j.rank);
      const matchSearch = j.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchNature = fNature === 'Any' || j.nature === fNature;
      const matchOrigin = fOrigin === 'Any' || j.origin === fOrigin;
      const matchSpec = fSpec === 'Any' || specArr.includes(fSpec);
      const matchType = fType === 'Any' || j.types.includes(fType);
      const matchRank = fRank === 'Any' || rankArr.includes(fRank);
      let matchClan = true;
      if (fClanCat !== 'Any') matchClan = j.clanCat === fClanCat && (fClanName === 'Any' || j.clanName === fClanName);
      const matchLimited = fLimited ? j.limited === true : true;
      const matchMultiRank = fMultiRank ? j.multiRank === true : true;
      return matchSearch && matchNature && matchOrigin && matchSpec && matchType && matchRank && matchClan && matchLimited && matchMultiRank;
    });
  }, [jutsus, searchTerm, fNature, fOrigin, fSpec, fType, fRank, fClanCat, fClanName, fLimited, fMultiRank, fActiveSecrets]);

  if (authLoading || dataLoading) {
    return (
      <div className="w-full h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
        <div className="w-8 h-8 border-3 border-slate-600 border-t-indigo-500 rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm font-semibold">Loading NARP Database...</p>
        {dataError && <p className="text-red-400 text-xs">Error: {dataError}</p>}
      </div>
    );
  }

  const isDataEmpty = jutsus.length === 0 && battlemodes.length === 0 && clanSlots.length === 0;

  const renderEmptyState = () => (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-slate-100 p-8">
      <Database size={48} className="text-slate-400" />
      <p className="text-slate-700 text-lg font-semibold">No Data Available</p>
      {dataError && <p className="text-red-500 text-sm">Error: {dataError}</p>}
      {currentUser?.role === 'admin' ? (
        <div className="text-center">
          <p className="text-slate-500 text-sm mb-3">Click below to fetch data from the database and make it available to all users.</p>
          <button onClick={handleForceRefresh} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 mx-auto transition-colors">
            <RefreshCw size={14} /> Refresh Data
          </button>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-slate-500 text-sm">No data available yet. An admin needs to refresh the database.</p>
          {!currentUser && <p className="text-slate-400 text-xs mt-2">If you are an admin, click <strong>Login</strong> above to get started.</p>}
        </div>
      )}
    </div>
  );

  const renderBrowser = () => (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      <div className="bg-slate-900 text-white p-4 shadow-md z-10 shrink-0">
        <div className="relative mb-3 max-w-4xl mx-auto">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input type="text" placeholder="Search jutsu name..." className="w-full bg-slate-800 text-white rounded-xl py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto flex-nowrap md:flex-wrap pb-1 scrollbar-hide max-w-4xl mx-auto">
          {['Any', ...NATURES].map(n => (
            <button key={n} onClick={() => setFNature(n)} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${fNature === n ? 'bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>{n}</button>
          ))}
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className="w-full max-w-4xl mx-auto mt-3 bg-slate-800 border border-slate-700 text-slate-300 py-2.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-700 transition-colors">
          <FilterIcon size={16} /> {showFilters ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
          {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border-b border-slate-200 p-4 shadow-inner overflow-y-auto max-h-72 shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Origin</label><select value={fOrigin} onChange={e => setFOrigin(e.target.value)} className="w-full text-sm bg-slate-50 border rounded p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"><option value="Any">All Origins</option>{ORIGIN.map(o => <option key={o} value={o}>{o}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Type</label><select value={fType} onChange={e => setFType(e.target.value)} className="w-full text-sm bg-slate-50 border rounded p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"><option value="Any">All Types</option>{JUTSU_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Rank</label><select value={fRank} onChange={e => setFRank(e.target.value)} className="w-full text-sm bg-slate-50 border rounded p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"><option value="Any">All Ranks</option>{RANKS.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
              <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Specialization</label><select value={fSpec} onChange={e => setFSpec(e.target.value)} className="w-full text-sm bg-slate-50 border rounded p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"><option value="Any">All Specs</option>{SPECIALIZATIONS.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
            </div>
            <div className="border-t border-slate-100 pt-4 mt-4">
              <label className="block text-[10px] font-bold text-purple-600 uppercase mb-2 flex items-center gap-1"><TagIcon size={12} /> Bloodline Filters</label>
              <div className="flex flex-col md:flex-row gap-3">
                <select value={fClanCat} onChange={e => { setFClanCat(e.target.value); setFClanName('Any'); }} className="flex-1 text-sm bg-purple-50 border-purple-200 text-purple-900 rounded p-2.5 focus:ring-2 focus:ring-purple-500 outline-none">
                  <option value="Any">Any Bloodline</option>
                  {CLAN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {fClanCat !== 'Any' && bloodlines[fClanCat] && (
                  <select value={fClanName} onChange={e => setFClanName(e.target.value)} className="flex-1 text-sm bg-white border-purple-200 text-purple-900 rounded p-2.5 focus:ring-2 focus:ring-purple-500 outline-none">
                    <option value="Any">All in {fClanCat}</option>
                    {bloodlines[fClanCat].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div className="pt-4 mt-4 border-t border-slate-100 space-y-3">
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer"><input type="checkbox" checked={fLimited} onChange={e => setFLimited(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" /> Limited Only</label>
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer"><input type="checkbox" checked={fMultiRank} onChange={e => setFMultiRank(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4" /> Multi-Rank Only</label>
                {visibleFactions.length > 0 && (
                  <>
                    <div className="w-px h-5 bg-slate-300 hidden md:block"></div>
                    {visibleFactions.map(faction => (
                      <label key={faction} className={`flex items-center gap-2 text-sm font-bold cursor-pointer transition-colors ${fActiveSecrets.includes(faction) ? 'text-purple-700' : 'text-slate-500'}`}>
                        <input type="checkbox" checked={fActiveSecrets.includes(faction)} onChange={(e) => { if (e.target.checked) setFActiveSecrets([...fActiveSecrets, faction]); else setFActiveSecrets(fActiveSecrets.filter(f => f !== faction)); }} className="rounded text-purple-600 focus:ring-purple-500 w-4 h-4" /> {faction} Secrets
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 bg-slate-100 pb-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-xs font-bold text-slate-400 uppercase">{filteredJutsus.length} Results Found</div>
              {fActiveSecrets.length > 0 && <span className="text-[10px] font-bold text-purple-600 bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-full uppercase">Secret Mode: {fActiveSecrets.join(', ')}</span>}
            </div>
            {currentUser?.role === 'admin' && (
              <button onClick={handleForceRefresh} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"><RefreshCw size={12} /> Refresh</button>
            )}
          </div>

          {dataError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle size={16} /> Failed to load data: {dataError}
            </div>
          )}

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredJutsus.map(j => {
              const specArr = toArray(j.spec);
              const rankArr = toArray(j.rank);
              return (
              <div key={j._id} className={`bg-white rounded-2xl shadow-sm border flex flex-col overflow-hidden hover:shadow-md transition-shadow ${j.secret ? 'border-purple-300 shadow-purple-100' : 'border-slate-200'}`}>
                <div className={`p-4 pb-0 flex-1 ${j.secret ? 'bg-purple-50/30' : ''}`}>
                  <div className="flex justify-between items-start mb-2"><h2 className="text-xl font-bold leading-tight flex items-center gap-2">{j.secret && <Lock size={16} className="text-purple-600 shrink-0" />} {j.name}</h2></div>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {j.nature && <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getNatureColor(j.nature)}`}>{j.nature}</span>}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${j.origin === 'Canon' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-cyan-50 text-cyan-700 border-cyan-200'}`}>{j.origin}</span>
                    {j.limited && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-100 text-rose-800 border-rose-200 flex items-center gap-1"><AlertCircle size={10} /> Limited</span>}
                    {j.limited && j.slots && (() => {
                      try {
                        const slots = JSON.parse(j.slots);
                        const filled = slots.filter(s => s.discord_id && s.username).length;
                        const remaining = slots.length - filled;
                        return <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${remaining > 0 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>{remaining > 0 ? `${remaining} slot${remaining !== 1 ? 's' : ''} open` : 'Full'}</span>;
                      } catch { return null; }
                    })()}
                    {j.secret && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 border-purple-200">SECRET</span>}
                    {j.staffReview && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-800 border-red-200">Staff Review Needed</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {specArr.map(s => <span key={s} className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">{s}</span>)}
                    {j.types.map(t => <span key={t} className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200">{t}</span>)}
                    {j.mustLearnIC && <span className="text-xs font-medium px-2 py-1 rounded border bg-slate-700 text-white border-slate-800">Must Learn IC</span>}
                    {j.clanCat !== 'None' && j.clanName !== 'None' && j.clanName && <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200 flex items-center gap-1"><TagIcon size={12} /> {j.clanName} ({j.clanCat})</span>}
                  </div>
                </div>
                <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between mt-auto">
                  <div className="flex items-center gap-4">
                    <div><div className="text-[10px] font-bold text-slate-400 uppercase">Rank</div><div className="text-sm font-black text-slate-700">{rankArr.join(", ") || "-"}</div></div>
                    <div className="h-6 w-px bg-slate-200"></div>
                    <div><div className="text-[10px] font-bold text-slate-400 uppercase">CU Cost</div><div className="text-sm font-black text-indigo-600">{j.cost || '-'}</div></div>
                  </div>
                  {j.multiRank && <span className="text-[10px] font-bold text-indigo-500 border border-indigo-200 bg-indigo-50 px-2 py-1 rounded-full uppercase shrink-0">Multi-Rank</span>}
                </div>
                <div className="p-4 pt-0 bg-slate-50 border-t border-slate-100 flex gap-2 pt-3">
                  {j.link && j.link !== 'Link' ? (
                    <a href={j.link} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-200 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"><ExternalLink size={16} /> Doc</a>
                  ) : (
                    <span className="flex-1 bg-slate-100 border border-slate-200 text-slate-400 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-sm cursor-not-allowed">No Doc</span>
                  )}
                  {j.link && j.link !== 'Link' && <button onClick={() => handleCopyLink(j.link, j._id)} className={`p-2.5 rounded-xl flex items-center justify-center min-w-[50px] transition-all border ${copiedId === j._id ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>{copiedId === j._id ? <Check size={18} /> : <Copy size={18} />}</button>}
                </div>
              </div>
              );
            })}
          </div>

          {filteredJutsus.length === 0 && (
            <div className="text-center py-16">
              <AlertCircle size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">No jutsu match your filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderClanSlots = () => {
    const availableCount = clanSlots.filter(c => c.available).length;
    const unavailableCount = clanSlots.filter(c => !c.available).length;

    return (
      <div className="flex-1 overflow-y-auto bg-slate-100 pb-10">
        <div className="bg-slate-900 text-white p-6 shadow-md">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <UserCheck size={28} className="text-indigo-400" />
              <div>
                <h2 className="text-2xl font-bold">Limited Specs & Availability</h2>
                <p className="text-sm text-slate-400 mt-0.5">Check which limited specs and items have open slots.</p>
              </div>
            </div>
            <div className="flex gap-4 mb-4">
              <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-4 py-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                <span className="text-sm font-bold text-emerald-300">{availableCount} Open</span>
              </div>
              <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <span className="text-sm font-bold text-red-300">{unavailableCount} Closed</span>
              </div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              <input type="text" placeholder="Search clan or item name..." className="w-full bg-slate-800 text-white rounded-xl py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-indigo-500 text-sm" value={clanSearch} onChange={(e) => setClanSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-4">
          {currentUser?.role === 'admin' && (
            <div className="flex justify-end mb-4">
              <button onClick={handleForceRefresh} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"><RefreshCw size={12} /> Refresh</button>
            </div>
          )}

          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClans.map((clan, idx) => {
              let slotsInfo = null;
              if (clan.slots) {
                try {
                  const slots = JSON.parse(clan.slots);
                  const filled = slots.filter(s => s.discord_id && s.username).length;
                  slotsInfo = { filled, total: slots.length, remaining: slots.length - filled };
                } catch {}
              }
              return (
              <div key={`${clan.name}-${idx}`} className={`rounded-xl border p-4 transition-shadow hover:shadow-md ${clan.available ? 'bg-white border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {clan.link ? (
                      <a href={clan.link} target="_blank" rel="noopener noreferrer" className={`font-bold text-sm underline decoration-1 underline-offset-2 transition-colors ${clan.available ? 'text-indigo-700 hover:text-indigo-900' : 'text-slate-400 hover:text-slate-600'}`}>{clan.name}</a>
                    ) : (
                      <span className={`font-bold text-sm ${clan.available ? 'text-slate-800' : 'text-slate-400'}`}>{clan.name}</span>
                    )}
                  </div>
                {clan.available ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-full">
                    <CheckCircle size={14} /> Open
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-100 border border-red-200 px-3 py-1 rounded-full">
                    <XCircle size={14} /> Closed
                  </span>
                )}
                </div>
                {slotsInfo && (
                  <div className="text-xs text-slate-500 mt-1">
                    <span className={`font-bold ${slotsInfo.remaining > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {slotsInfo.remaining > 0 ? `${slotsInfo.remaining} of ${slotsInfo.total} slots open` : 'All slots filled'}
                    </span>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {filteredClans.length === 0 && (
            <div className="text-center py-16">
              <AlertCircle size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">No results match your search.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderBattlemodes = () => {
    const availableCount = battlemodes.filter(bm => bm.available).length;
    const unavailableCount = battlemodes.filter(bm => !bm.available).length;

    return (
      <div className="flex-1 overflow-y-auto bg-slate-100 pb-10">
        <div className="bg-slate-900 text-white p-6 shadow-md">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-3 mb-4">
              <Swords size={28} className="text-rose-400" />
              <div>
                <h2 className="text-2xl font-bold">Battlemodes</h2>
                <p className="text-sm text-slate-400 mt-0.5">Browse available battlemodes by category.</p>
              </div>
            </div>
            <div className="flex gap-4 mb-4 flex-wrap">
              <div className="bg-emerald-500/20 border border-emerald-500/30 rounded-xl px-4 py-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
                <span className="text-sm font-bold text-emerald-300">{availableCount} Available</span>
              </div>
              {unavailableCount > 0 && (
                <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-2 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <span className="text-sm font-bold text-red-300">{unavailableCount} Unavailable</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 overflow-x-auto flex-nowrap md:flex-wrap pb-1 scrollbar-hide mb-3">
              {['Any', ...BATTLEMODE_CATEGORIES].map(cat => (
                <button key={cat} onClick={() => setFBmCategory(cat)} className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition-colors ${fBmCategory === cat ? 'bg-rose-500 border-rose-400 text-white shadow-lg shadow-rose-500/30' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>{cat}</button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={18} />
              <input type="text" placeholder="Search battlemode name..." className="w-full bg-slate-800 text-white rounded-xl py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-rose-500 text-sm" value={bmSearch} onChange={(e) => setBmSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto p-4">
          {currentUser?.role === 'admin' && (
            <div className="flex justify-end mb-4">
              <button onClick={handleForceRefresh} className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors"><RefreshCw size={12} /> Refresh</button>
            </div>
          )}

          <div className="text-xs font-bold text-slate-400 uppercase mb-4">{filteredBattlemodes.length} Results Found</div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {filteredBattlemodes.map(bm => (
              <div key={bm._id} className={`rounded-2xl border flex flex-col overflow-hidden hover:shadow-md transition-shadow ${!bm.available ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200'}`}>
                <div className="p-4 pb-0 flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <h2 className="text-lg font-bold leading-tight">{bm.name}</h2>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {bm.category && bm.category.split(',').map(c => c.trim()).filter(Boolean).map(c => (
                      <span key={c} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getBattlemodeColor(c)}`}>{c}</span>
                    ))}
                    {bm.nature && bm.nature.split(',').map(n => n.trim()).filter(Boolean).map(n => (
                      <span key={n} className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getNatureColor(n)}`}>{n}</span>
                    ))}
                    {bm.limitedSlots ? (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${bm.available ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                        <AlertCircle size={10} /> {bm.available ? 'Available' : 'Unavailable'}
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${bm.available ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                        {bm.available ? 'Available' : 'Unavailable'}
                      </span>
                    )}
                    {bm.mustLearnIC && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-700 text-white border border-slate-800">Must Learn IC</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {bm.clan && <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-200 flex items-center gap-1"><TagIcon size={12} /> {bm.clan}</span>}
                    {bm.limitedSlots && bm.slots && (() => {
                      try {
                        const slots = JSON.parse(bm.slots);
                        const filled = slots.filter(s => s.discord_id && s.username).length;
                        const remaining = slots.length - filled;
                        return <span className={`text-xs font-bold px-2 py-1 rounded border ${remaining > 0 ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>{remaining > 0 ? `${remaining} slot${remaining !== 1 ? 's' : ''} open` : 'Full'}</span>;
                      } catch { return null; }
                    })()}
                  </div>
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2 mt-auto">
                  {bm.link && bm.link !== 'Link' ? (
                    <a href={bm.link} target="_blank" rel="noopener noreferrer" className="flex-1 bg-white border border-slate-200 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-200 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-sm transition-colors"><ExternalLink size={16} /> Doc</a>
                  ) : (
                    <span className="flex-1 bg-slate-100 border border-slate-200 text-slate-400 font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-sm cursor-not-allowed">No Doc</span>
                  )}
                  {bm.link && bm.link !== 'Link' && <button onClick={() => handleCopyLink(bm.link, bm._id)} className={`p-2.5 rounded-xl flex items-center justify-center min-w-[50px] transition-all border ${copiedId === bm._id ? 'bg-green-500 border-green-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>{copiedId === bm._id ? <Check size={18} /> : <Copy size={18} />}</button>}
                </div>
              </div>
            ))}
          </div>

          {filteredBattlemodes.length === 0 && battlemodes.length === 0 && (
            <div className="text-center py-16">
              <AlertCircle size={40} className="text-amber-400 mx-auto mb-3" />
              <p className="text-slate-600 font-semibold mb-2">No battlemode data available.</p>
              <p className="text-slate-400 text-sm max-w-md mx-auto">No battlemodes found in the database. An admin needs to add battlemodes via the Manage tab.</p>
            </div>
          )}
          {filteredBattlemodes.length === 0 && battlemodes.length > 0 && (
            <div className="text-center py-16">
              <AlertCircle size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">No battlemodes match your filters.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderLogin = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-100 overflow-y-auto">
      <div className="bg-white p-8 rounded-3xl shadow-xl border w-full max-w-sm">
        <h2 className="text-2xl font-bold mb-2 text-center text-slate-800">Login</h2>
        <p className="text-sm text-slate-500 mb-6 text-center">{isRequesting ? 'Register for an account. An admin will approve your access.' : 'Log in to access the NARP Database.'}</p>
        {loginMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${loginMessage.type === 'error' ? 'bg-red-50 text-red-800' : loginMessage.type === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{loginMessage.text}</div>
        )}

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <input type="email" required placeholder="Email Address" className="w-full bg-slate-50 border py-3 px-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} disabled={loginLoading} />
          <input type="password" required minLength={6} placeholder={isRequesting ? "Create Password (min 6)" : "Password"} className="w-full bg-slate-50 border py-3 px-4 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} disabled={loginLoading} />
          <button type="submit" disabled={loginLoading} className="w-full text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 bg-indigo-600 hover:bg-indigo-700">
            {loginLoading ? 'Please wait...' : isRequesting ? 'Request Access' : 'Log In'}
          </button>
          <div className="flex justify-between items-center pt-2">
            <button type="button" onClick={() => { setIsRequesting(!isRequesting); setLoginMessage(null); }} className="text-sm font-semibold text-slate-500 hover:text-slate-800">{isRequesting ? 'Already approved? Log in' : 'Need access? Register'}</button>
            <button type="button" onClick={() => setView('browser')} className="text-slate-400 text-sm font-semibold hover:text-slate-600">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );

  const renderAdminDashboard = () => {
    const pendingUsers = allUsers.filter(u => u.status === 'pending');
    const approvedUsers = allUsers.filter(u => u.status === 'approved' && u.uid !== currentUser?.uid);
    const deniedUsers = allUsers.filter(u => u.status === 'denied');
    const isSuperAdmin = currentUser?.email === SUPER_ADMIN_EMAIL;

    return (
      <div className="flex-1 bg-slate-50 overflow-y-auto p-4 md:p-8 pb-10">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 bg-emerald-600 text-white p-6 rounded-2xl flex items-center gap-4 shadow-lg">
            <UsersIcon size={32} />
            <div><h2 className="text-2xl font-bold">Admin Dashboard</h2><p className="text-sm text-emerald-100 mt-1">Manage user accounts, roles, and approvals.</p></div>
          </div>

          {/* Database Management Section */}
          <div className="mb-8 bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-cyan-100 p-2 rounded-full text-cyan-600"><Database size={20} /></div>
              <div>
                <h3 className="font-bold text-slate-800">Database Management</h3>
                <p className="text-xs text-slate-500">Manage the Neon database and refresh frontend data.</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <button
                onClick={handleForceRefresh}
                disabled={dataLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
              >
                <RefreshCw size={16} className={dataLoading ? 'animate-spin' : ''} />
                Refresh Frontend Data
              </button>
            </div>
          </div>

          {/* Pending Jutsu Entries Approval */}
          {pendingEntries.length > 0 && (
            <div className="mb-8 bg-white border border-amber-200 shadow-sm rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-amber-100 p-2 rounded-full text-amber-600"><Clock size={20} /></div>
                <div>
                  <h3 className="font-bold text-slate-800">Pending Database Entries ({pendingEntries.length})</h3>
                  <p className="text-xs text-slate-500">Staff submissions awaiting approval before publication.</p>
                </div>
              </div>
              <div className="space-y-3">
                {pendingEntries.map(entry => {
                  let entryData = {};
                  try { entryData = JSON.parse(entry.entry_data); } catch {}
                  const canApproveThis = currentUser?.role === 'admin' || (currentUser?.role === 'staff' && currentUser?.email !== entry.submitted_by_email);
                  return (
                    <div key={entry.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-amber-600">{entry.table_name}</span>
                          <h4 className="text-sm font-bold text-slate-800">{entryData.name || '(untitled)'}</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Submitted by: <strong>{entry.submitted_by_email}</strong></p>
                        </div>
                        <div className="flex gap-2">
                          {canApproveThis ? (
                            <>
                              <button onClick={() => handleResolveEntry(entry.id, 'approve').catch(err => setManageError(err.message))} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><CheckCircle size={14} /> Approve</button>
                              <button onClick={() => handleResolveEntry(entry.id, 'deny').catch(err => setManageError(err.message))} className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle size={14} /> Deny</button>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 italic">Awaiting other reviewer</span>
                          )}
                        </div>
                      </div>
                      {currentUser?.role === 'staff' && currentUser?.email !== entry.submitted_by_email && (
                        <p className="text-[10px] text-amber-700 mt-1">Staff approval will publish with [Admin Approval Pending] tag.</p>
                      )}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(entryData).filter(([k, v]) => v && k !== 'name' && k !== 'slots').map(([k, v]) => (
                          <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-white border border-amber-200 text-slate-600" title={`${k}: ${v}`}>{k}: {String(v).substring(0, 30)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pending Faction Access Requests */}
          {pendingFactionRequests.length > 0 && (
            <div className="mb-8 bg-white border border-purple-200 shadow-sm rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="bg-purple-100 p-2 rounded-full text-purple-600"><Key size={20} /></div>
                <div>
                  <h3 className="font-bold text-slate-800">Pending Faction Access Requests ({pendingFactionRequests.length})</h3>
                  <p className="text-xs text-slate-500">Faction secret access requests awaiting approval.</p>
                </div>
              </div>
              <div className="space-y-3">
                {pendingFactionRequests.map(req => {
                  const canApproveThis = currentUser?.role === 'admin' || (currentUser?.role === 'staff' && currentUser?.email !== req.requested_by_email);
                  return (
                    <div key={req.id} className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800">Grant <span className="text-purple-700">{req.faction}</span> access to <span className="text-slate-600">{req.target_email}</span></p>
                        <p className="text-xs text-slate-500 mt-0.5">Requested by: <strong>{req.requested_by_email}</strong></p>
                      </div>
                      <div className="flex gap-2">
                        {canApproveThis ? (
                          <>
                            <button onClick={() => handleResolveFactionRequest(req.id, 'approve').catch(err => console.error(err))} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><CheckCircle size={14} /> Approve</button>
                            <button onClick={() => handleResolveFactionRequest(req.id, 'deny').catch(err => console.error(err))} className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle size={14} /> Deny</button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Awaiting other reviewer</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Role Guide */}
          <div className="mb-8 bg-white border border-slate-200 shadow-sm rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-indigo-100 p-2 rounded-full text-indigo-600"><BookOpen size={20} /></div>
              <div>
                <h3 className="font-bold text-slate-800">Role Hierarchy & Permissions</h3>
                <p className="text-xs text-slate-500">Four-tier role system with approval workflows.</p>
              </div>
            </div>
            <div className="space-y-3 text-sm text-slate-700">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-slate-800 mb-2">Role Permissions:</p>
                <ul className="space-y-1.5 text-xs">
                  <li className="flex items-center gap-2"><Shield size={14} className="text-indigo-600 shrink-0" /> <strong>Admin</strong> — Manage users, approve entries directly, grant faction access. Can promote Users to Staff and demote Staff to Users.</li>
                  <li className="flex items-center gap-2"><UserCheck size={14} className="text-cyan-600 shrink-0" /> <strong>Staff</strong> — Can manage data (entries require approval). Can request faction access (requires second approval).</li>
                  <li className="flex items-center gap-2"><Key size={14} className="text-purple-600 shrink-0" /> <strong>User</strong> — Can view faction secrets assigned to them. Browse-only access.</li>
                </ul>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="font-bold text-slate-800 mb-2">Approval Workflows:</p>
                <ul className="space-y-1.5 text-xs">
                  <li><strong>Jutsu Entries:</strong> Staff submissions require approval. Admin approval publishes immediately. Staff-to-staff approval publishes with [Admin Approval Pending] tag.</li>
                  <li><strong>Faction Secrets:</strong> Admins can grant access directly. Staff must have a second Staff member or Admin approve the request.</li>
                </ul>
              </div>
            </div>
          </div>

          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Pending ({pendingUsers.length})</h3>
          <div className="space-y-3 mb-8">
            {pendingUsers.map(user => (
              <div key={user.uid} className="bg-white border border-amber-200 shadow-sm rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="bg-amber-100 p-2 rounded-full text-amber-600"><Clock size={20} /></div>
                  <div><p className="font-bold text-slate-800">{user.nickname || user.email}</p>{user.nickname && <p className="text-[10px] text-slate-400">{user.email}</p>}<p className="text-[10px] font-bold uppercase text-amber-600 mt-0.5">Requesting: {user.role}</p></div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <button onClick={() => handleUpdateUserStatus(user.uid, 'approved')} className="flex-1 md:flex-none bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1"><CheckCircle size={16} /> Approve</button>
                  <button onClick={() => handleUpdateUserStatus(user.uid, 'denied')} className="flex-1 md:flex-none bg-red-100 text-red-700 hover:bg-red-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-1"><XCircle size={16} /> Deny</button>
                </div>
              </div>
            ))}
            {pendingUsers.length === 0 && <div className="text-center p-8 bg-white border border-dashed border-slate-300 rounded-2xl text-slate-400 text-sm">No pending requests.</div>}
          </div>

          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Approved ({approvedUsers.length})</h3>
          <div className="space-y-4 mb-8">
            {approvedUsers.map(user => {
              const promoteOptions = canPromote(user.role, user.email);
              const demoteOptions = canDemote(user.role, user.email);
              const roleColor = user.role === 'admin' ? 'bg-indigo-100 text-indigo-600' : user.role === 'staff' ? 'bg-cyan-100 text-cyan-600' : 'bg-purple-100 text-purple-600';
              const roleIcon = user.role === 'admin' ? <Shield size={20} /> : user.role === 'staff' ? <UserCheck size={20} /> : <Key size={20} />;

              return (
              <div key={user.uid} className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 md:p-5">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${roleColor}`}>{roleIcon}</div>
                    <div>
                      <p className="font-bold text-slate-700">{user.nickname || user.email}</p>
                      {user.nickname && <p className="text-[10px] text-slate-400">{user.email}</p>}
                      <p className="text-[10px] font-bold uppercase text-slate-400 mt-0.5">
                        {user.role}
                      </p>
                    </div>
                    {currentUser?.role === 'admin' && (
                      <button
                        onClick={() => {
                          const name = prompt('Set nickname for ' + user.email + ':', user.nickname || '');
                          if (name !== null) handleSetNickname(user.uid, name);
                        }}
                        className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 p-1 rounded-lg transition-colors ml-1"
                        title="Set nickname"
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Promote/Demote controls */}
                    {promoteOptions.length > 0 && (
                      <div className="flex gap-1">
                        {promoteOptions.map(newRole => (
                          <button key={`promote-${newRole}`} onClick={() => handleChangeUserRole(user.uid, newRole)}
                            className="text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg text-[10px] font-bold border border-emerald-200 transition-colors"
                            title={`Promote to ${newRole}`}>
                            Promote to {newRole}
                          </button>
                        ))}
                      </div>
                    )}
                    {demoteOptions.length > 0 && (
                      <div className="flex gap-1">
                        {demoteOptions.map(newRole => (
                          <button key={`demote-${newRole}`} onClick={() => handleChangeUserRole(user.uid, newRole)}
                            className="text-amber-600 hover:bg-amber-50 px-2 py-1 rounded-lg text-[10px] font-bold border border-amber-200 transition-colors"
                            title={`Demote to ${newRole}`}>
                            Demote to {newRole}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Delete account */}
                    {(user.role !== 'admin' || isSuperAdmin) && user.email !== SUPER_ADMIN_EMAIL ? (
                      <button onClick={() => handleDeleteAccount(user.uid, user.nickname || user.email)} className="text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Trash2 size={14} /> Delete</button>
                    ) : (
                      <span className="text-slate-300 px-3 py-1.5 text-xs font-bold" title="Protected account">Protected</span>
                    )}
                  </div>
                </div>
                {/* Faction access for users */}
                {user.role === 'user' && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-3">
                      Grant Faction Secrets:
                      {currentUser?.role === 'staff' && <span className="normal-case font-normal text-amber-600 ml-1">(requires second approval)</span>}
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {ALL_FACTIONS.map(faction => {
                        const hasPendingRequest = pendingFactionRequests.some(r => r.target_uid === user.uid && r.faction === faction);
                        const hasAccess = user.allowedFactions?.includes(faction);
                        return (
                          <label key={faction} className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-3 py-1.5 rounded border transition-colors ${hasAccess ? 'bg-purple-50 border-purple-300 text-purple-800' : hasPendingRequest ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                            <input
                              type="checkbox"
                              checked={hasAccess || false}
                              disabled={hasPendingRequest}
                              onChange={() => {
                                if (currentUser?.role === 'admin') {
                                  // Admin grants directly
                                  handleToggleFaction(user.uid, faction);
                                } else if (currentUser?.role === 'staff') {
                                  if (hasAccess) {
                                    // Revoking: staff can request revocation via approval too
                                    handleRequestFactionAccess(user.uid, user.email, faction).catch(err => console.error(err));
                                  } else {
                                    // Staff submits request for approval
                                    handleRequestFactionAccess(user.uid, user.email, faction).catch(err => console.error(err));
                                  }
                                }
                              }}
                              className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                            />
                            {faction}
                            {hasPendingRequest && <span className="text-[9px] text-amber-600 ml-1">(pending)</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* Also show faction access for faction role (backwards compat) */}
                {user.role === 'faction' && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-3">
                      Grant Faction Secrets:
                      {currentUser?.role === 'staff' && <span className="normal-case font-normal text-amber-600 ml-1">(requires second approval)</span>}
                    </p>
                    <div className="flex flex-wrap gap-2.5">
                      {ALL_FACTIONS.map(faction => {
                        const hasPendingRequest = pendingFactionRequests.some(r => r.target_uid === user.uid && r.faction === faction);
                        const hasAccess = user.allowedFactions?.includes(faction);
                        return (
                          <label key={faction} className={`flex items-center gap-1.5 text-xs font-semibold cursor-pointer px-3 py-1.5 rounded border transition-colors ${hasAccess ? 'bg-purple-50 border-purple-300 text-purple-800' : hasPendingRequest ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                            <input
                              type="checkbox"
                              checked={hasAccess || false}
                              disabled={hasPendingRequest}
                              onChange={() => {
                                if (currentUser?.role === 'admin') {
                                  handleToggleFaction(user.uid, faction);
                                } else if (currentUser?.role === 'staff') {
                                  handleRequestFactionAccess(user.uid, user.email, faction).catch(err => console.error(err));
                                }
                              }}
                              className="rounded text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                            />
                            {faction}
                            {hasPendingRequest && <span className="text-[9px] text-amber-600 ml-1">(pending)</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>

          {deniedUsers.length > 0 && (
            <>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Denied ({deniedUsers.length})</h3>
              <div className="space-y-3">
                {deniedUsers.map(user => (
                  <div key={user.uid} className="bg-white border border-red-100 shadow-sm rounded-xl p-4 flex justify-between items-center opacity-60">
                    <div className="flex items-center gap-3">
                      <div className="bg-red-100 p-2 rounded-full text-red-400"><XCircle size={20} /></div>
                      <div><p className="font-bold text-slate-600">{user.nickname || user.email}</p>{user.nickname && <p className="text-[10px] text-slate-400">{user.email}</p>}<p className="text-[10px] font-bold uppercase text-red-400">{user.role}</p></div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleUpdateUserStatus(user.uid, 'approved')} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1"><CheckCircle size={16} /> Re-approve</button>
                      {user.email !== SUPER_ADMIN_EMAIL && (
                        <button onClick={() => handleDeleteAccount(user.uid, user.nickname || user.email)} className="bg-red-100 text-red-700 hover:bg-red-200 px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-1"><Trash2 size={16} /> Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderAdminData = () => {
    const apiKeys = rawApiData ? Object.keys(rawApiData).filter(k => k !== '_fetchedAt') : [];
    const fetchedAt = rawApiData?._fetchedAt || 'N/A';

    const renderDataSection = (key) => {
      const data = rawApiData[key];
      if (Array.isArray(data)) {
        if (data.length === 0) return <p className="text-sm text-slate-400 italic">Empty array (0 items)</p>;
        return (
          <div className="overflow-auto max-h-[70vh]">
            <p className="text-xs text-slate-500 mb-2">{data.length} items</p>
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100">
                  {Object.keys(data[0]).map(col => (
                    <th key={col} className="border border-slate-200 px-2 py-1 text-left font-bold text-slate-600 whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    {Object.values(row).map((val, j) => (
                      <td key={j} className="border border-slate-200 px-2 py-1 text-slate-700 max-w-[200px] truncate" title={String(val)}>{String(val)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } else if (typeof data === 'object' && data !== null) {
        return (
          <pre className="bg-slate-50 p-3 rounded-lg text-xs text-slate-700 overflow-x-auto max-h-60 overflow-y-auto border border-slate-200">{JSON.stringify(data, null, 2)}</pre>
        );
      } else {
        return <p className="text-sm text-slate-700">{String(data)}</p>;
      }
    };

    return (
      <div className="flex-1 bg-slate-50 overflow-y-auto p-4 md:p-8 pb-32">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 bg-slate-800 text-white p-6 rounded-2xl flex items-center gap-4 shadow-lg">
            <Database size={32} className="text-cyan-400" />
            <div>
              <h2 className="text-2xl font-bold">API Data Inspector</h2>
              <p className="text-sm text-slate-300 mt-1">Raw data from the Neon database API.</p>
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-slate-500">
              Fetched at: <span className="font-mono">{fetchedAt}</span>
            </div>
            <button onClick={handleForceRefresh} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg"><RefreshCw size={12} /> Force Refresh</button>
          </div>

          {!rawApiData ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <AlertCircle size={40} className="text-amber-400 mx-auto mb-3" />
              <p className="text-slate-600 font-semibold">No raw API data available.</p>
              <p className="text-slate-400 text-sm mt-1">Try refreshing the data.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-700 mb-2">API Response Keys</h3>
                <div className="flex flex-wrap gap-2">
                  {apiKeys.map(key => {
                    const val = rawApiData[key];
                    const count = Array.isArray(val) ? val.length : typeof val === 'object' && val !== null ? Object.keys(val).length : 1;
                    const typeLabel = Array.isArray(val) ? `array[${count}]` : typeof val === 'object' && val !== null ? `object{${count}}` : typeof val;
                    return (
                      <span key={key} className="bg-slate-100 border border-slate-200 px-3 py-1 rounded-full text-xs font-mono">
                        <span className="font-bold text-slate-800">{key}</span>
                        <span className="text-slate-400 ml-1">({typeLabel})</span>
                      </span>
                    );
                  })}
                </div>
              </div>

              {apiKeys.map(key => (
                <details key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <summary className="p-4 cursor-pointer hover:bg-slate-50 transition-colors flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{key}</span>
                      <span className="text-xs text-slate-400 font-mono">
                        {Array.isArray(rawApiData[key]) ? `${rawApiData[key].length} items` : typeof rawApiData[key]}
                      </span>
                    </div>
                    <ChevronDown size={16} className="text-slate-400" />
                  </summary>
                  <div className="p-4 pt-0 border-t border-slate-100">
                    {renderDataSection(key)}
                  </div>
                </details>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderManageData = () => {
    const tableConfig = MANAGE_TABLES[manageTable];
    const filteredManageRows = manageSearch.trim()
      ? manageRows.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(manageSearch.toLowerCase())))
      : manageRows;

    return (
      <div className="flex-1 bg-slate-50 overflow-y-auto p-4 md:p-8 pb-32">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6 bg-indigo-700 text-white p-6 rounded-2xl flex items-center gap-4 shadow-lg">
            <Edit2 size={32} className="text-indigo-200" />
            <div>
              <h2 className="text-2xl font-bold">Manage Data</h2>
              <p className="text-sm text-indigo-200 mt-1">Add, edit, or delete items directly in the Neon database.</p>
            </div>
          </div>

          {/* Table selector */}
          <div className="flex items-center gap-2 overflow-x-auto flex-nowrap pb-1 scrollbar-hide mb-4">
            {Object.entries(MANAGE_TABLES).map(([key, cfg]) => (
              <button key={key} onClick={() => handleManageTableChange(key)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap border transition-colors ${manageTable === key ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                {cfg.label}
              </button>
            ))}
          </div>

          {/* Success/Error messages */}
          {manageSuccess && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-2">
              <CheckCircle size={16} /> {manageSuccess}
            </div>
          )}
          {manageError && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200 flex items-center gap-2">
              <AlertCircle size={16} /> {manageError}
            </div>
          )}

          {/* Pending entries notification for staff */}
          {currentUser?.role === 'staff' && pendingEntries.filter(e => e.submitted_by_email === currentUser.email).length > 0 && (
            <div className="mb-4 p-3 rounded-lg text-sm bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-2">
              <Clock size={16} /> You have {pendingEntries.filter(e => e.submitted_by_email === currentUser.email).length} pending submission(s) awaiting approval.
            </div>
          )}

          {/* Pending entries that this user can approve */}
          {pendingEntries.filter(e => e.table_name === manageTable && e.submitted_by_email !== currentUser?.email).length > 0 && (
            <div className="mb-4 bg-white border border-amber-200 rounded-2xl p-4">
              <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2"><Clock size={16} /> Pending Approvals for {MANAGE_TABLES[manageTable]?.label}</h4>
              <div className="space-y-2">
                {pendingEntries.filter(e => e.table_name === manageTable && e.submitted_by_email !== currentUser?.email).map(entry => {
                  let entryData = {};
                  try { entryData = JSON.parse(entry.entry_data); } catch {}
                  return (
                    <div key={entry.id} className="bg-amber-50 rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold text-slate-800">{entryData.name || '(untitled)'}</p>
                        <p className="text-[10px] text-slate-500">by {entry.submitted_by_email}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleResolveEntry(entry.id, 'approve').then(() => setManageSuccess('Entry approved!')).catch(err => setManageError(err.message))} className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold"><CheckCircle size={12} className="inline mr-1" />Approve</button>
                        <button onClick={() => handleResolveEntry(entry.id, 'deny').then(() => setManageSuccess('Entry denied.')).catch(err => setManageError(err.message))} className="bg-red-100 text-red-700 hover:bg-red-200 px-3 py-1.5 rounded-lg text-xs font-bold"><XCircle size={12} className="inline mr-1" />Deny</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add/Edit Form */}
          {editingRow !== null && (
            <div className="mb-6 bg-white rounded-2xl border border-indigo-200 shadow-md p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                {editingRow.id ? <><Edit2 size={18} /> Edit {tableConfig.label.slice(0, -1)}</> : <><PlusCircle size={18} /> Add New {tableConfig.label.slice(0, -1)}</>}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tableConfig.fields.filter(f => {
                  if (f.hidden) return false;
                  if (f.hidden_unless) return formData[f.hidden_unless] === 'Yes';
                  if (f.hidden_unless_includes) {
                    const val = (formData[f.hidden_unless_includes.field] || '').split(',').map(v => v.trim());
                    return val.includes(f.hidden_unless_includes.value);
                  }
                  return true;
                }).map(field => (
                  <div key={field.key} className={field.type === 'slots' ? 'md:col-span-2' : ''}>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                      {field.optional && <span className="text-slate-400 normal-case font-normal ml-1">(optional)</span>}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {field.options.map(opt => (
                          <option key={opt} value={opt}>{opt || `— Select ${field.label} —`}</option>
                        ))}
                      </select>
                    ) : field.type === 'multi-select' ? (
                      <CheckboxDropdown
                        label={field.label}
                        options={field.options}
                        selected={formData[field.key] || ''}
                        onChange={(val) => setFormData({ ...formData, [field.key]: val })}
                      />
                    ) : field.type === 'multi-select-editable' ? (
                      <CheckboxDropdown
                        label={field.label}
                        options={[...new Set([...field.options, ...customSpecs])]}
                        selected={formData[field.key] || ''}
                        onChange={(val) => setFormData({ ...formData, [field.key]: val })}
                        allowAdd
                        onAddOption={(opt) => setCustomSpecs([...customSpecs, opt])}
                        onRemoveOption={(opt) => setCustomSpecs(customSpecs.filter(s => s !== opt))}
                      />
                    ) : field.type === 'bloodline-select' ? (
                      <BloodlineSelect
                        value={formData[field.key] || ''}
                        onChange={(val) => setFormData({ ...formData, [field.key]: val })}
                      />
                    ) : field.type === 'faction-select' ? (
                      <FactionSelect
                        value={formData[field.key] || ''}
                        onChange={(val) => setFormData({ ...formData, [field.key]: val })}
                      />
                    ) : field.type === 'checkbox' ? (
                      <label className="flex items-center gap-2 cursor-pointer mt-1">
                        <input
                          type="checkbox"
                          checked={formData[field.key] === 'Yes'}
                          onChange={(e) => setFormData({ ...formData, [field.key]: e.target.checked ? 'Yes' : '' })}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-5 h-5"
                        />
                        <span className="text-sm text-slate-700">{field.label}</span>
                      </label>
                    ) : field.type === 'slots' ? (
                      <SlotsEditor
                        value={formData[field.key] || '[]'}
                        onChange={(val) => setFormData({ ...formData, [field.key]: val })}
                      />
                    ) : (
                      <input
                        type="text"
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder={field.label}
                      />
                    )}
                  </div>
                ))}
                {/* Auto-cost display for jutsus */}
                {manageTable === 'jutsus' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                      Cost {!customCost && (() => {
                        const ranks = (formData.rank || '').split(',').map(r => r.trim()).filter(Boolean);
                        if (ranks.length === 1 && RANK_COST_MAP[ranks[0]]) return <span className="text-indigo-500 normal-case font-normal">(auto: {RANK_COST_MAP[ranks[0]]})</span>;
                        if (ranks.length > 1) return <span className="text-indigo-500 normal-case font-normal">(auto: {ranks.map(r => RANK_COST_MAP[r]).filter(Boolean).join(' / ')})</span>;
                        return null;
                      })()}
                    </label>
                    <div className="flex items-center gap-3">
                      {customCost ? (
                        <input
                          type="text"
                          value={formData.cost || ''}
                          onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                          className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                          placeholder="Custom cost"
                        />
                      ) : (
                        <div className="flex-1 text-sm bg-slate-100 border border-slate-200 rounded-lg p-2.5 text-slate-500">
                          {(() => {
                            const ranks = (formData.rank || '').split(',').map(r => r.trim()).filter(Boolean);
                            if (ranks.length === 1 && RANK_COST_MAP[ranks[0]]) return RANK_COST_MAP[ranks[0]];
                            if (ranks.length > 1) return ranks.map(r => RANK_COST_MAP[r]).filter(Boolean).join(' / ');
                            return 'Select a rank';
                          })()}
                        </div>
                      )}
                      <label className="flex items-center gap-1.5 text-xs text-slate-500 whitespace-nowrap cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={customCost}
                          onChange={(e) => {
                            setCustomCost(e.target.checked);
                            if (!e.target.checked) {
                              const ranks = (formData.rank || '').split(',').map(r => r.trim()).filter(Boolean);
                              if (ranks.length === 1 && RANK_COST_MAP[ranks[0]]) {
                                setFormData({ ...formData, cost: RANK_COST_MAP[ranks[0]] });
                              }
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Custom
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={handleSaveRow}
                  disabled={manageLoading || tableConfig.fields.filter(f => f.required).some(f => !formData[f.key]?.trim())}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors"
                >
                  <Save size={16} /> {editingRow.id ? 'Update' : 'Add'}
                </button>
                <button onClick={handleCancelEdit} className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors">Cancel</button>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="text-xs font-bold text-slate-400 uppercase">{filteredManageRows.length} of {manageRows.length} {tableConfig.label}</div>
              <button onClick={handleStartAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors">
                <PlusCircle size={14} /> Add New
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
              <input
                type="text"
                placeholder={`Search ${tableConfig.label.toLowerCase()}...`}
                className="bg-white border border-slate-200 rounded-lg py-2 pl-8 pr-4 text-sm outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                value={manageSearch}
                onChange={(e) => setManageSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Cards View */}
          {manageLoading && manageRows.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-slate-400 text-sm">Loading data...</p>
            </div>
          ) : filteredManageRows.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Database size={40} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 font-semibold">{manageRows.length === 0 ? `No ${tableConfig.label.toLowerCase()} in the database yet.` : 'No results match your search.'}</p>
            </div>
          ) : (
            <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {filteredManageRows.map((row) => {
                const visibleFields = tableConfig.fields.filter(f => !f.hidden && f.key !== 'name' && f.type !== 'slots');
                const slotsField = tableConfig.fields.find(f => f.type === 'slots');
                const hasSlots = slotsField && row[slotsField.key];
                let slotsInfo = null;
                if (hasSlots) {
                  try {
                    const slots = JSON.parse(row[slotsField.key]);
                    const filled = slots.filter(s => s.discord_id && s.username).length;
                    slotsInfo = { filled, total: slots.length, remaining: slots.length - filled };
                  } catch {}
                }
                return (
                  <div key={row.id} className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono">#{row.id}</span>
                        <h4 className="text-sm font-bold text-slate-800 leading-tight">{row.name || '(untitled)'}</h4>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        <button onClick={() => handleStartEdit(row)} className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 transition-colors" title="Edit">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDeleteRow(row.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {visibleFields.map(f => {
                        const val = row[f.key];
                        if (!val) return null;
                        if (f.type === 'checkbox' && val === 'Yes') {
                          return <span key={f.key} className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">{f.label}</span>;
                        }
                        if (f.type === 'checkbox') return null;
                        // Multi-value fields show as tags
                        const vals = val.includes(',') ? val.split(',').map(v => v.trim()).filter(Boolean) : [val];
                        return vals.map(v => (
                          <span key={`${f.key}-${v}`} className="px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-700 border-slate-200" title={`${f.label}: ${v}`}>
                            {v}
                          </span>
                        ));
                      })}
                      {row.staff_review === 'Yes' && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-100 text-red-800 border border-red-200">Staff Review Needed</span>}
                    {(row.name || '').startsWith('[Admin Approval Pending]') && currentUser?.role === 'admin' && (
                      <button
                        onClick={() => handleClearAdminPending(row.id, manageTable).catch(err => setManageError(err.message))}
                        className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 hover:bg-emerald-200 cursor-pointer"
                      >
                        Approve & Clear Tag
                      </button>
                    )}
                    {(row.name || '').startsWith('[Admin Approval Pending]') && currentUser?.role !== 'admin' && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-200">Admin Approval Pending</span>
                    )}
                    </div>
                    {slotsInfo && (
                      <div className="text-xs text-slate-500 mt-1">
                        <span className={`font-bold ${slotsInfo.remaining > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {slotsInfo.remaining > 0 ? `${slotsInfo.remaining} slot${slotsInfo.remaining !== 1 ? 's' : ''} open` : 'Full'}
                        </span>
                        <span className="text-slate-400 ml-1">({slotsInfo.filled}/{slotsInfo.total})</span>
                      </div>
                    )}
                    {row.doc_link && (
                      <a href={row.doc_link} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 mt-1 inline-flex items-center gap-1"><ExternalLink size={10} /> Doc</a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-screen bg-slate-200 flex flex-col font-sans text-slate-900 overflow-hidden">
      <div className="bg-slate-900 text-white p-4 sticky top-0 z-30 flex justify-between items-center shadow-lg shrink-0">
        <h1 className="text-lg font-bold tracking-widest uppercase flex items-center gap-2">
          {view === 'browser' && <BookOpen size={18} className="text-indigo-400" />}
          {view === 'clan_slots' && <UserCheck size={18} className="text-emerald-400" />}
          {view === 'battlemodes' && <Swords size={18} className="text-rose-400" />}
          {view === 'login' && <Key size={18} className="text-indigo-400" />}
          {view === 'admin_dashboard' && <UsersIcon size={18} className="text-emerald-400" />}
          {view === 'admin_data' && <Database size={18} className="text-cyan-400" />}
          {view === 'manage_data' && <Edit2 size={18} className="text-indigo-400" />}
          <span className="hidden sm:inline">
            {view === 'browser' ? 'NARP Database' : view === 'clan_slots' ? 'Limited Specs' : view === 'battlemodes' ? 'Battlemodes' : view === 'login' ? 'Auth Portal' : view === 'admin_data' ? 'API Data' : view === 'manage_data' ? 'Manage Data' : 'Admin Area'}
          </span>
          <span className="sm:hidden">
            {view === 'browser' ? 'NARP' : view === 'clan_slots' ? 'Specs' : view === 'battlemodes' ? 'BM' : view === 'login' ? 'Auth' : view === 'admin_data' ? 'Data' : view === 'manage_data' ? 'Manage' : 'Admin'}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setView('browser')} className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-colors ${view === 'browser' ? 'bg-indigo-900 text-indigo-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
            <span className="hidden sm:inline">Jutsu</span>
            <span className="sm:hidden"><BookOpen size={14} /></span>
          </button>
          <button onClick={() => setView('clan_slots')} className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-colors ${view === 'clan_slots' ? 'bg-emerald-900 text-emerald-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
            <span className="hidden sm:inline">Limited Specs</span>
            <span className="sm:hidden"><UserCheck size={14} /></span>
          </button>
          <button onClick={() => setView('battlemodes')} className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-colors ${view === 'battlemodes' ? 'bg-rose-900 text-rose-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
            <span className="hidden sm:inline">Battlemodes</span>
            <span className="sm:hidden"><Swords size={14} /></span>
          </button>

          {currentUser ? (
            <>
              <span className="text-xs text-slate-400 hidden lg:inline mx-1">{currentUser.nickname || currentUser.email}</span>
              {(currentUser.role === 'admin' || currentUser.role === 'staff') && (
                <button onClick={() => setView('admin_dashboard')} className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-colors ${view === 'admin_dashboard' ? 'bg-indigo-900 text-indigo-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                  <span className="hidden sm:inline">Dashboard</span>
                  <span className="sm:hidden"><UsersIcon size={14} /></span>
                </button>
              )}
              {(currentUser.role === 'admin' || currentUser.role === 'staff') && (
                <button onClick={() => setView('admin_data')} className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-colors ${view === 'admin_data' ? 'bg-cyan-900 text-cyan-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                  <span className="hidden sm:inline">API Data</span>
                  <span className="sm:hidden"><Database size={14} /></span>
                </button>
              )}
              {(currentUser.role === 'admin' || currentUser.role === 'staff') && (
                <button onClick={() => setView('manage_data')} className={`text-xs px-3 py-1.5 font-bold rounded-lg transition-colors ${view === 'manage_data' ? 'bg-indigo-700 text-indigo-200' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                  <span className="hidden sm:inline">Manage</span>
                  <span className="sm:hidden"><Edit2 size={14} /></span>
                </button>
              )}
              <button onClick={handleLogout} className="text-slate-400 hover:text-white p-1.5 bg-slate-800 rounded-lg"><LogOut size={16} /></button>
            </>
          ) : (
            <button onClick={() => setView('login')} className="text-white flex items-center gap-1.5 text-xs font-bold bg-indigo-600 border border-indigo-500 px-3 py-2 rounded-lg transition-colors hover:bg-indigo-500"><Shield size={14} />Login</button>
          )}
        </div>
      </div>

      {view === 'browser' && (isDataEmpty ? renderEmptyState() : renderBrowser())}
      {view === 'clan_slots' && (isDataEmpty ? renderEmptyState() : renderClanSlots())}
      {view === 'battlemodes' && (isDataEmpty ? renderEmptyState() : renderBattlemodes())}
      {view === 'login' && renderLogin()}
      {view === 'admin_dashboard' && (currentUser?.role === 'admin' || currentUser?.role === 'staff') && renderAdminDashboard()}
      {view === 'admin_data' && (currentUser?.role === 'admin' || currentUser?.role === 'staff') && renderAdminData()}
      {view === 'manage_data' && (currentUser?.role === 'admin' || currentUser?.role === 'staff') && renderManageData()}

      <div className="bg-slate-900 text-center py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest z-20 shrink-0 border-t border-slate-800">
        Credits: Hexagon & A Road Sign — {APP_VERSION}
      </div>
    </div>
  );
}

export default App;
