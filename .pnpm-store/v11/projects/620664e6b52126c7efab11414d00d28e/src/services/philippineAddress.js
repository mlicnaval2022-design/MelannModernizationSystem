const ADDRESS_DATA_BASE_URL = 'https://isaacdarcilla.github.io/philippine-addresses';
const addressDataCache = new Map();

async function loadAddressData(dataSetName) {
  if (!addressDataCache.has(dataSetName)) {
    addressDataCache.set(
      dataSetName,
      fetch(`${ADDRESS_DATA_BASE_URL}/${dataSetName}.json`).then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load ${dataSetName} address data`);
        }
        return response.json();
      })
    );
  }

  return addressDataCache.get(dataSetName);
}

export async function regions() {
  const rows = await loadAddressData('region');
  return rows.map((region) => ({
    id: region.id,
    psgc_code: region.psgc_code,
    region_name: region.region_name,
    region_code: region.region_code
  }));
}

export async function provinces(regionCode) {
  const rows = await loadAddressData('province');
  return rows
    .filter((province) => province.region_code === regionCode)
    .map((province) => ({
      psgc_code: province.psgc_code,
      province_name: province.province_name,
      province_code: province.province_code,
      region_code: province.region_code
    }));
}

export async function cities(provinceCode) {
  const rows = await loadAddressData('city');
  return rows
    .filter((city) => city.province_code === provinceCode)
    .map((city) => ({
      city_name: city.city_name,
      city_code: city.city_code,
      province_code: city.province_code,
      region_desc: city.region_desc
    }));
}

export async function barangays(cityCode) {
  const rows = await loadAddressData('barangay');
  return rows
    .filter((barangay) => barangay.city_code === cityCode)
    .map((barangay) => ({
      brgy_name: barangay.brgy_name,
      brgy_code: barangay.brgy_code,
      province_code: barangay.province_code,
      region_code: barangay.region_code
    }));
}
