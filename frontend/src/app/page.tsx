'use client'

import { FormEvent, useRef, useState } from 'react'

// ---- constants ----
const GENDERS = ['FEMALE', 'MALE']
const RACES = [
  'ASIAN AMERICAN',
  'BLACK/AFRICAN AMERICAN',
  'HISPANIC/LATINO',
  'OTHER',
  'PORTUGUESE',
  'WHITE',
]
const DISPOSITIONS = ['ADMITTED', 'ELOPED', 'HOME', 'LEFT AGAINST MEDICAL ADVICE', 'TRANSFER']

type FormState = {
  gender: string
  race: string
  disposition: string
  acuity: string
  pain: string
  visit_hours: string
  chiefcomplaint: string
  med_record: string
  temperature: string
  heartrate: string
  resprate: string
  o2sat: string
  sbp: string
  dbp: string
  heartrate_readings: string
  resprate_readings: string
  o2sat_readings: string
  sbp_readings: string
  dbp_readings: string
}

type Result = {
  icd_titles: string[]
  adm_medications: string[]
  recommendation: string
}

type IcuRow = {
  label: string
  unit: string
  readingsKey: keyof FormState
  placeholder: string
}

const ICU_ROWS: IcuRow[] = [
  { label: 'Heart Rate',       unit: 'bpm',    readingsKey: 'heartrate_readings', placeholder: 'e.g. 78, 82, 80, 85' },
  { label: 'Respiratory Rate', unit: 'br/min', readingsKey: 'resprate_readings',  placeholder: 'e.g. 16, 18, 17'     },
  { label: 'O₂ Saturation',    unit: '%',      readingsKey: 'o2sat_readings',     placeholder: 'e.g. 97, 98, 96'     },
  { label: 'Systolic BP',      unit: 'mmHg',   readingsKey: 'sbp_readings',       placeholder: 'e.g. 118, 122, 115'  },
  { label: 'Diastolic BP',     unit: 'mmHg',   readingsKey: 'dbp_readings',       placeholder: 'e.g. 78, 80, 76'     },
]

const DEFAULTS: FormState = {
  gender: 'MALE',
  race: 'WHITE',
  disposition: 'ADMITTED',
  acuity: '2',
  pain: '4',
  visit_hours: '',
  chiefcomplaint: '',
  med_record: '',
  temperature: '98.6',
  heartrate: '80',
  resprate: '18',
  o2sat: '98',
  sbp: '120',
  dbp: '80',
  heartrate_readings: '',
  resprate_readings: '',
  o2sat_readings: '',
  sbp_readings: '',
  dbp_readings: '',
}

const inputCls =
  'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent'

// ---- helpers ----
function cleanRecommendation(text: string): string {
  // Strip any re-appended patient record section the model occasionally emits
  let out = text.split(/\n\s*Patient Record\s*\n/i)[0]
  // Strip trailing standalone numbers (e.g. "1\n2\n3" artefacts)
  out = out.replace(/(\n\s*\d+\.?\s*)+$/g, '').trim()
  return out
}

function stripMedMeasurements(med: string): string {
  // Remove trailing dosage: e.g. "Metoprolol Tartrate 25 mg" → "Metoprolol Tartrate"
  return med
    .replace(/\s+\d[\d./]*\s*(mg|mcg|g(?!\w)|mL|ml|L(?!\w)|units?|%|mEq|mmol|IU|tablet|tab|cap|capsule|cc|oz|patch|drops?|sprays?|puffs?)\b.*/gi, '')
    .trim()
}

function parseReadings(s: string): number[] {
  return s.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n))
}

function computeMean(vals: number[]): number {
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function computeTrend(vals: number[]): 'increasing' | 'stable' | 'decreasing' {
  if (vals.length < 2) return 'stable'
  const n = vals.length
  const xMean = (n - 1) / 2
  const yMean = computeMean(vals)
  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (vals[i] - yMean)
    den += (i - xMean) ** 2
  }
  const slope = den !== 0 ? num / den : 0
  const normalizedSlope = yMean !== 0 ? slope / yMean : slope
  if (normalizedSlope > 0.05) return 'increasing'
  if (normalizedSlope < -0.05) return 'decreasing'
  return 'stable'
}

function ReadingsPreview({ readings }: { readings: string }) {
  const vals = parseReadings(readings)
  if (vals.length < 1) return null
  const mean = computeMean(vals).toFixed(1)
  const trend = vals.length >= 2 ? computeTrend(vals) : null
  const trendColor = trend === 'increasing' ? 'text-orange-500' : trend === 'decreasing' ? 'text-blue-500' : 'text-green-600'
  return (
    <span className="ml-2 text-xs text-gray-400">
      mean: <span className="font-medium text-gray-600">{mean}</span>
      {trend && <span className={`ml-2 font-medium ${trendColor}`}>{trend}</span>}
    </span>
  )
}

// ---- page ----
export default function Home() {
  const [form, setForm] = useState<FormState>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  function field(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const computedTrends: Record<string, number | string> = {}
      for (const row of ICU_ROWS) {
        const vals = parseReadings(form[row.readingsKey] as string)
        const prefix = row.readingsKey.replace('_readings', '')
        computedTrends[`${prefix}_vital_mean`] = vals.length > 0 ? computeMean(vals) : 0
        computedTrends[`${prefix}_vital_trend`] = vals.length > 0 ? computeTrend(vals) : 'stable'
      }

      const resp = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gender: form.gender,
          race: form.race,
          disposition: form.disposition,
          acuity: Number(form.acuity),
          pain: Number(form.pain),
          visit_hours: Number(form.visit_hours),
          chiefcomplaint: form.chiefcomplaint,
          med_record: form.med_record,
          temperature: Number(form.temperature),
          heartrate: Number(form.heartrate),
          resprate: Number(form.resprate),
          o2sat: Number(form.o2sat),
          sbp: Number(form.sbp),
          dbp: Number(form.dbp),
          ...computedTrends,
        }),
      })
      if (!resp.ok) throw new Error(`Server error ${resp.status}: ${await resp.text()}`)
      const data: Result = await resp.json()
      setResult(data)
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <header className="bg-navy text-white rounded-xl px-8 py-6 mb-8">
        <h1 className="text-2xl font-bold">Clinical Decision Support</h1>
        <p className="text-sm opacity-75 mt-1">BioMistral-7B · CREST-grounded recommendations</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Patient Record */}
        <Card title="Patient Record">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Label text="Gender">
              <SelectField value={form.gender} onChange={field('gender')} options={GENDERS} />
            </Label>
            <Label text="Race">
              <SelectField value={form.race} onChange={field('race')} options={RACES} />
            </Label>
            <Label text="Disposition">
              <SelectField value={form.disposition} onChange={field('disposition')} options={DISPOSITIONS} />
            </Label>
            <Label text="Acuity" sub="1 = least severe, 4 = most severe">
              <SelectField value={form.acuity} onChange={field('acuity')} options={['1', '2', '3', '4']} />
            </Label>
            <Label text="Pain Score" sub="0–10; higher = worse">
              <NumField value={form.pain} onChange={field('pain')} min={0} max={10} step={1} />
            </Label>
            <Label text="Time in Visit So Far" sub="hours">
              <NumField value={form.visit_hours} onChange={field('visit_hours')} min={0} max={720} step={0.5} />
            </Label>
          </div>
          <Label text="Chief Complaint" sub="comma-separated">
            <input
              type="text"
              value={form.chiefcomplaint}
              onChange={field('chiefcomplaint')}
              placeholder="e.g. Fatigue, shortness of breath"
              required
              className={inputCls}
            />
          </Label>
          <Label text="Medication History" sub="comma-separated">
            <input
              type="text"
              value={form.med_record}
              onChange={field('med_record')}
              placeholder="e.g. aspirin, metoprolol, lisinopril"
              required
              className={inputCls}
            />
          </Label>
        </Card>

        {/* Vitals on Arrival */}
        <Card title="Vitals on Arrival">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Label text="Temperature (°F)">
              <NumField value={form.temperature} onChange={field('temperature')} min={35} max={110} step={0.1} />
            </Label>
            <Label text="Heart Rate (bpm)">
              <NumField value={form.heartrate} onChange={field('heartrate')} min={20} max={300} step={1} />
            </Label>
            <Label text="Respiratory Rate (breaths/min)">
              <NumField value={form.resprate} onChange={field('resprate')} min={4} max={80} step={1} />
            </Label>
            <Label text="O₂ Saturation (%)">
              <NumField value={form.o2sat} onChange={field('o2sat')} min={50} max={100} step={1} />
            </Label>
            <Label text="Systolic BP (mmHg)">
              <NumField value={form.sbp} onChange={field('sbp')} min={40} max={350} step={1} />
            </Label>
            <Label text="Diastolic BP (mmHg)">
              <NumField value={form.dbp} onChange={field('dbp')} min={20} max={220} step={1} />
            </Label>
          </div>
        </Card>

        {/* ICU Vital Trends */}
        <Card title="ICU Vital Trends">
          <p className="text-xs text-gray-500 -mt-2">Enter comma-separated readings from the ICU stay. Mean and trend are calculated automatically.</p>
          <div className="space-y-3">
            {ICU_ROWS.map(({ label, unit, readingsKey, placeholder }) => (
              <div key={readingsKey}>
                <div className="flex items-center mb-1">
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <span className="text-gray-400 text-xs ml-1">({unit})</span>
                  <ReadingsPreview readings={form[readingsKey] as string} />
                </div>
                <input
                  type="text"
                  value={form[readingsKey] as string}
                  onChange={field(readingsKey)}
                  placeholder={placeholder}
                  required
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        </Card>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-lg text-white font-semibold bg-primary hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
        >
          {loading
            ? 'Running clinical analysis — this may take 30–60 seconds…'
            : 'Run Analysis'}
        </button>
      </form>

      {/* Results */}
      <div ref={resultsRef}>
        {result && (
          <section className="mt-10 space-y-4">
            <h2 className="text-xl font-bold text-navy border-b border-gray-200 pb-2">Results</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ResultCard title="Predicted ICD Diagnoses">
                <ul className="list-disc list-inside space-y-1">
                  {result.icd_titles.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </ResultCard>
              <ResultCard title="Suggested Medications">
                <ul className="list-disc list-inside space-y-1">
                  {result.adm_medications.map((m, i) => <li key={i}>{stripMedMeasurements(m)}</li>)}
                </ul>
              </ResultCard>
            </div>
            <ResultCard title="Treatment Recommendation">
              <p className="whitespace-pre-wrap leading-relaxed">{cleanRecommendation(result.recommendation)}</p>
            </ResultCard>
          </section>
        )}

        {error && (
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>
    </main>
  )
}

// ---- shared sub-components ----
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
      <h2 className="font-semibold text-navy text-base border-b border-gray-100 pb-2">{title}</h2>
      {children}
    </div>
  )
}

function Label({ text, sub, children }: { text: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {text}
        {sub && <span className="text-gray-400 font-normal ml-1">({sub})</span>}
      </label>
      {children}
    </div>
  )
}

function SelectField({
  value, onChange, options,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void
  options: string[]
}) {
  return (
    <select value={value} onChange={onChange} className={inputCls}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function NumField({
  value, onChange, min, max, step,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  min: number
  max: number
  step: number
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      step={step}
      required
      className={inputCls}
    />
  )
}

function ResultCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="font-semibold text-navy text-xs uppercase tracking-wide mb-3">{title}</h3>
      <div className="text-sm text-gray-800">{children}</div>
    </div>
  )
}
