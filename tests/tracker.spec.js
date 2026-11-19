const {test,expect}=require('@playwright/test');
const key='gymtracker-v1';
const day=(page,w,d)=>page.locator(`details.day[data-week="${w}"][data-day="${d}"]`);
const saved=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
async function open(page,w,d){
  if(w<(await saved(page))?.weeks.length-1){const archive=page.locator(`details.archive[data-week="${w}"]`);if(!await archive.getAttribute('open').then(v=>v!==null))await archive.locator(':scope > summary').click()}
  const row=day(page,w,d);if(await row.getAttribute('open')===null)await row.locator('summary').click();return row.locator('form');
}
async function approve(page,w,d){const f=await open(page,w,d);await f.locator('[name=date]').fill(`2026-11-${String(w*7+d+1).padStart(2,'0')}`);if(await f.locator('[name=iron]').count())await f.locator('[name=iron]').check();await f.locator('[name=cardio]').check();await f.getByRole('button').click()}
test.beforeEach(async({page})=>{await page.goto('/')});
test('preserves artwork, validates approval and fits phone layout',async({page})=>{
  expect(await page.locator('header').evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('data:image/jpeg;base64,');
  const f=await open(page,0,5);await f.getByRole('button').click();expect(await saved(page)).toBeNull();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('approves in any order and creates exactly one successor per completed week',async({page})=>{
  await page.locator('#extra').locator('..').locator('summary').click();await page.locator('#extra [name=minutes]').fill('20');await page.locator('#extra button').click();
  expect((await saved(page)).weeks[0].days.filter(Boolean)).toHaveLength(0);
  for(const w of [0,1]){
    for(const [i,d] of [6,2,4,0,5,1,3].entries()){
      await approve(page,w,d);const s=await saved(page);expect(s.weeks).toHaveLength(w+1);
    }
    await page.getByRole('button',{name:'إنهاء الأسبوع والانتقال للأسبوع التالي'}).click();
  }
  await page.reload();const s=await saved(page);expect(s.weeks).toHaveLength(3);expect(s.weeks[0].extra[0].minutes).toBe(20);
  await expect(page.getByRole('heading',{name:'الأسبوع 3',exact:true})).toBeVisible();
  await expect(page.locator('details.archive > summary').first()).toHaveClass('done');
});
test('edits current and historical days, preserves legacy data, updates stats and closes details',async({page})=>{
  const old={days:Array.from({length:7},(_,i)=>({date:`2026-10-${String(i+1).padStart(2,'0')}`,type:'المشي العادي',minutes:30,iron:![3,6].includes(i)})),extra:[{date:'2026-10-01',type:'كارديو آخر',minutes:10}]};
  await page.evaluate(({key,old})=>localStorage.setItem(key,JSON.stringify({weeks:[old,{days:Array(7).fill(null),extra:[]}]})),{key,old});await page.reload();
  await approve(page,1,4);
  for(const [w,d] of [[1,4],[0,0],[0,6]]){
    let f=await open(page,w,d);await expect(f.locator('[name=cardio]')).toBeChecked();
    await expect(day(page,w,d).getByLabel('تعديل اليوم')).toBeVisible();
    await f.locator('[name=date]').fill(w?'2026-11-20':d===0?'2026-10-20':'2026-10-21');
    await f.locator('[name=iron]').uncheck();await f.locator('[name=minutes]').fill('60');await f.locator('[name=cardio]').uncheck();await f.locator('[name=type]').selectOption('جهاز الدرج');
    await f.getByRole('button',{name:'حفظ التعديلات'}).click();await expect(day(page,w,d)).not.toHaveAttribute('open','');
    const s=await saved(page);expect(s.weeks).toHaveLength(2);expect(s.weeks[w].days[d]).toMatchObject({iron:false,cardio:false,minutes:60,type:'جهاز الدرج'});
  }
  expect((await saved(page)).weeks[0].days[1]).toEqual(old.days[1]);expect((await saved(page)).weeks[0].extra).toEqual(old.extra);
  await expect(page.locator('[data-stats-week="0"]')).toContainText('الحديد: 4 / 5');
  await expect(page.locator('[data-stats-week="0"]')).toContainText('الكارديو: 160 دقيقة');
  const f=await open(page,0,0);await f.locator('[name=cardio]').check();await f.locator('[name=iron]').check();await f.getByRole('button').click();
  expect((await saved(page)).weeks).toHaveLength(2);await page.reload();
  await open(page,0,0);await expect(day(page,0,0).locator('[name=minutes]')).toHaveValue('60');
});
test('rejects duplicate dates on approval and editing but permits unchanged dates',async({page})=>{
  await approve(page,0,4);await approve(page,0,2);
  const f=await open(page,0,4);await f.getByRole('button').click();expect((await saved(page)).weeks[0].days[4].date).toBe('2026-11-05');
  const edit=await open(page,0,4);await edit.locator('[name=date]').fill('2026-11-03');page.once('dialog',d=>d.accept());await edit.getByRole('button').click();expect((await saved(page)).weeks[0].days[4].date).toBe('2026-11-05');
});
test('failed save preserves edits and retry closes a completed week only once',async({page})=>{
  for(const d of [6,2,4,0,5,1])await approve(page,0,d);
  await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw new Error('full')}});
  page.once('dialog',d=>d.accept());await approve(page,0,3);expect((await saved(page)).weeks).toHaveLength(1);expect((await saved(page)).weeks[0].days[3]).toBeNull();await expect(page.getByRole('status')).toContainText('تعذر');
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem});await day(page,0,3).locator('button').click();expect((await saved(page)).weeks).toHaveLength(1);
  await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('full')}});page.once('dialog',d=>d.accept());await page.locator('#finish-week').click();expect((await saved(page)).weeks).toHaveLength(1);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem});await page.locator('#finish-week').click();expect((await saved(page)).weeks).toHaveLength(2);
  const f=await open(page,0,3);await f.locator('[name=minutes]').fill('99');await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('full')}});page.once('dialog',d=>d.accept());await f.getByRole('button').click();await expect(f.locator('[name=minutes]')).toHaveValue('99');expect((await saved(page)).weeks[0].days[3].minutes).toBe(45);
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem});await f.getByRole('button').click();expect((await saved(page)).weeks).toHaveLength(2);await page.reload();expect((await saved(page)).weeks[0].days[3].minutes).toBe(99);
});

test('optional cardio, empty rest days, explicit five-lift completion and archive edits',async({page})=>{
  const finish=page.getByRole('button',{name:'إنهاء الأسبوع والانتقال للأسبوع التالي'});
  await expect(finish).toHaveCount(0);
  for(const d of [3,6]){
    const f=await open(page,0,d);
    await f.locator('[name=date]').fill('2026-11-'+String(d+1).padStart(2,'0'));
    await expect(f.locator('[name=minutes]')).toBeDisabled();
    await f.getByRole('button').click();
    expect((await saved(page)).weeks[0].days[d]).toMatchObject({iron:false,cardio:false});
  }
  for(const d of [4,2,0,5,1]){
    const f=await open(page,0,d);
    await f.locator('[name=date]').fill('2026-11-'+String(d+1).padStart(2,'0'));
    await f.locator('[name=iron]').check();
    if(d===2){await f.locator('[name=cardio]').check();await f.locator('[name=minutes]').fill('17')}
    await f.getByRole('button').click();
    expect((await saved(page)).weeks).toHaveLength(1);
  }
  await expect(finish).toBeVisible();
  await expect(page.locator('[data-stats-week="0"]')).toContainText('الكارديو: 1 / 7');
  await expect(page.locator('[data-stats-week="0"]')).toContainText('الكارديو: 17 دقيقة');
  const f=await open(page,0,0);await f.locator('[name=iron]').uncheck();await f.getByRole('button').click();await expect(finish).toHaveCount(0);
  const edit=await open(page,0,0);await edit.locator('[name=iron]').check();await edit.getByRole('button').click();
  const previous=(await saved(page)).weeks[0];await finish.click();
  expect((await saved(page)).weeks[0]).toEqual(previous);
  await page.reload();await expect(page.locator('details.archive > summary')).toHaveClass('done');
  const archived=await open(page,0,3);await archived.locator('[name=cardio]').check();await archived.locator('[name=minutes]').fill('12');await archived.getByRole('button').click();
  expect((await saved(page)).weeks).toHaveLength(2);
  await expect(page.locator('[data-stats-week="0"]')).toContainText('الكارديو: 29 دقيقة');
});
test('finishes with both rest days unapproved and preserves legacy storage on load',async({page})=>{
  const legacy={weeks:[{days:[0,1,2,3,4,5,6].map(i=>[3,6].includes(i)?null:{date:'2026-10-'+String(i+1).padStart(2,'0'),iron:true,type:'المشي العادي',minutes:30}),extra:[],custom:'preserve'}],custom:'unchanged'};
  const raw=JSON.stringify(legacy);
  await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw});await page.reload();
  expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(raw);
  await page.locator('#finish-week').click();
  const result=await saved(page);expect(result.weeks).toHaveLength(2);expect(result.weeks[0]).toEqual(legacy.weeks[0]);expect(result.custom).toBe('unchanged');
  const rest=await open(page,0,6);await rest.locator('[name=date]').fill('2026-10-07');await rest.getByRole('button').click();
  expect((await saved(page)).weeks[0].days[6].cardio).toBe(false);
  expect((await saved(page)).weeks).toHaveLength(2);
});
