import { afterEach, describe, expect, it, vi } from 'vitest';
import { barangays, cities, provinces, regions } from './philippineAddress';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('philippine address service', () => {
  it('loads and maps address data without the vulnerable address package', async () => {
    const payloads = {
      region: [{ id: 1, psgc_code: '01', region_name: 'Region One', region_code: 'R1' }],
      province: [{ psgc_code: '011', province_name: 'Province One', province_code: 'P1', region_code: 'R1' }],
      city: [{ city_name: 'City One', city_code: 'C1', province_code: 'P1', region_desc: 'Region One' }],
      barangay: [{ brgy_name: 'Barangay One', brgy_code: 'B1', city_code: 'C1', province_code: 'P1', region_code: 'R1' }]
    };

    vi.stubGlobal('fetch', vi.fn((url) => {
      const dataSetName = String(url).split('/').pop().replace('.json', '');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(payloads[dataSetName])
      });
    }));

    await expect(regions()).resolves.toEqual([
      { id: 1, psgc_code: '01', region_name: 'Region One', region_code: 'R1' }
    ]);
    await expect(provinces('R1')).resolves.toEqual([
      { psgc_code: '011', province_name: 'Province One', province_code: 'P1', region_code: 'R1' }
    ]);
    await expect(cities('P1')).resolves.toEqual([
      { city_name: 'City One', city_code: 'C1', province_code: 'P1', region_desc: 'Region One' }
    ]);
    await expect(barangays('C1')).resolves.toEqual([
      { brgy_name: 'Barangay One', brgy_code: 'B1', province_code: 'P1', region_code: 'R1' }
    ]);
  });
});
