import { readFile, writeFile } from 'node:fs/promises'

// Curated list of Indian companies to add (startups, unicorns, major product/service MNCs in India)
const indianCompaniesToAdd = [
  // Product Startups & Unicorns
  { name: 'Paytm', type: 'Product' },
  { name: 'Swiggy', type: 'Product' },
  { name: 'Zomato', type: 'Product' },
  { name: 'Ola Cabs', type: 'Product' },
  { name: 'Ola Electric', type: 'Product' },
  { name: 'Zepto', type: 'Product' },
  { name: 'Blinkit', type: 'Product' },
  { name: 'Cred', type: 'Product' },
  { name: 'Groww', type: 'Product' },
  { name: 'Zerodha', type: 'Product' },
  { name: 'Upstox', type: 'Product' },
  { name: 'Nykaa', type: 'Product' },
  { name: 'Lenskart', type: 'Product' },
  { name: 'Urban Company', type: 'Product' },
  { name: 'Delhivery', type: 'Product' },
  { name: 'Dream11', type: 'Product' },
  { name: 'ShareChat', type: 'Product' },
  { name: 'Dailyhunt', type: 'Product' },
  { name: 'Unacademy', type: 'Product' },
  { name: 'PhysicsWallah', type: 'Product' },
  { name: 'UpGrad', type: 'Product' },
  { name: 'Vedantu', type: 'Product' },
  { name: 'Eruditus', type: 'Product' },
  { name: 'Zoho', type: 'Product' },
  { name: 'Freshworks', type: 'Product' },
  { name: 'Druva', type: 'Product' },
  { name: 'BrowserStack', type: 'Product' },
  { name: 'Hasura', type: 'Product' },
  { name: 'Chargebee', type: 'Product' },
  { name: 'CleverTap', type: 'Product' },
  { name: 'Yellow.ai', type: 'Product' },
  { name: 'Gupshup', type: 'Product' },
  { name: 'Amagi', type: 'Product' },
  { name: 'Icertis', type: 'Product' },
  { name: 'Mindtickle', type: 'Product' },
  { name: 'HighRadius', type: 'Product' },
  { name: 'Zenoti', type: 'Product' },
  { name: 'Darwinbox', type: 'Product' },
  { name: 'Quizizz', type: 'Product' },
  { name: 'Innovaccer', type: 'Product' },
  { name: 'Pristyn Care', type: 'Product' },
  { name: 'PharmEasy', type: 'Product' },
  { name: 'Tata 1mg', type: 'Product' },
  { name: 'Cult.fit', type: 'Product' },
  { name: 'Cure.fit', type: 'Product' },
  { name: 'HealthifyMe', type: 'Product' },
  { name: 'MapmyIndia', type: 'Product' },
  { name: 'Pocket FM', type: 'Product' },
  { name: 'Pratilipi', type: 'Product' },
  { name: 'Kuku FM', type: 'Product' },
  { name: 'Jupiter', type: 'Product' },
  { name: 'Fi Money', type: 'Product' },
  { name: 'Slice', type: 'Product' },
  { name: 'Uni Cards', type: 'Product' },
  { name: 'OneCard', type: 'Product' },
  { name: 'Navi', type: 'Product' },
  { name: 'Pine Labs', type: 'Product' },
  { name: 'BharatPe', type: 'Product' },
  { name: 'Mobikwik', type: 'Product' },
  { name: 'Jio', type: 'Product' },
  { name: 'Airtel', type: 'Product' },
  { name: 'Tata Communications', type: 'Product' },
  { name: 'Snapdeal', type: 'Product' },
  { name: 'ShopClues', type: 'Product' },
  { name: 'Infibeam', type: 'Product' },
  { name: 'Ninjacart', type: 'Product' },
  { name: 'Dunzo', type: 'Product' },
  { name: 'Shadowfax', type: 'Product' },
  { name: 'Porter', type: 'Product' },
  { name: 'BlackBuck', type: 'Product' },
  { name: 'Rivigo', type: 'Product' },
  { name: 'Shiprocket', type: 'Product' },
  { name: 'BigBasket', type: 'Product' },
  { name: 'Rebel Foods', type: 'Product' },
  { name: 'Faasos', type: 'Product' },
  { name: 'Chaayos', type: 'Product' },
  { name: 'Chai Point', type: 'Product' },
  { name: 'Licious', type: 'Product' },
  { name: 'FreshToHome', type: 'Product' },
  { name: 'Captain Fresh', type: 'Product' },
  { name: 'Country Delight', type: 'Product' },
  { name: 'Akshayakalpa', type: 'Product' },
  { name: 'MyBillBook', type: 'Product' },
  { name: 'FloBiz', type: 'Product' },
  { name: 'Dukaan', type: 'Product' },
  { name: 'Bikayi', type: 'Product' },
  { name: 'Khatabook', type: 'Product' },
  { name: 'OkCredit', type: 'Product' },
  { name: 'Whatfix', type: 'Product' },
  { name: 'LeadSquared', type: 'Product' },
  { name: 'Signzy', type: 'Product' },
  { name: 'InVideo', type: 'Product' },
  { name: 'Acko', type: 'Product' },
  { name: 'Digit Insurance', type: 'Product' },
  { name: 'Policybazaar', type: 'Product' },
  { name: 'Paisabazaar', type: 'Product' },
  { name: 'CarDekho', type: 'Product' },
  { name: 'Spinny', type: 'Product' },
  { name: 'Cars24', type: 'Product' },
  { name: 'Droom', type: 'Product' },
  { name: 'BookMyShow', type: 'Product' },
  { name: 'Ixigo', type: 'Product' },
  { name: 'MakeMyTrip', type: 'Product' },
  { name: 'Yatra', type: 'Product' },
  { name: 'EaseMyTrip', type: 'Product' },
  { name: 'Urban Ladder', type: 'Product' },
  { name: 'Pepperfry', type: 'Product' },
  { name: 'HomeLane', type: 'Product' },
  { name: 'Livspace', type: 'Product' },
  { name: 'NoBroker', type: 'Product' },
  { name: 'MagicBricks', type: 'Product' },
  { name: '99acres', type: 'Product' },
  { name: 'Housing.com', type: 'Product' },
  { name: 'CommonFloor', type: 'Product' },
  { name: 'FirstCry', type: 'Product' },
  { name: 'Hopscotch', type: 'Product' },
  { name: 'Tatacliq', type: 'Product' },
  { name: 'Ajio', type: 'Product' },
  { name: 'Zivame', type: 'Product' },
  { name: 'Clovia', type: 'Product' },
  { name: 'Bluestone', type: 'Product' },
  { name: 'CaratLane', type: 'Product' },
  { name: 'Melorra', type: 'Product' },
  { name: 'Chumbak', type: 'Product' },
  { name: 'DailyObjects', type: 'Product' },
  { name: 'Bewakoof', type: 'Product' },
  { name: 'The Souled Store', type: 'Product' },
  { name: 'Myntra', type: 'Product' },
  { name: 'Flipkart', type: 'Product' },
  
  // Service MNCs with huge India operations
  { name: 'TCS', type: 'Service' },
  { name: 'Infosys', type: 'Service' },
  { name: 'Wipro', type: 'Service' },
  { name: 'HCLTech', type: 'Service' },
  { name: 'Tech Mahindra', type: 'Service' },
  { name: 'Cognizant', type: 'Service' },
  { name: 'Capgemini', type: 'Service' },
  { name: 'Accenture', type: 'Service' },
  { name: 'LTIMindtree', type: 'Service' },
  { name: 'DXC Technology', type: 'Service' },
  { name: 'Persistent Systems', type: 'Service' },
  { name: 'Coforge', type: 'Service' },
  { name: 'Mphasis', type: 'Service' },
  { name: 'Happiest Minds', type: 'Service' },
  { name: 'Tata Elxsi', type: 'Service' },
  { name: 'KPIT', type: 'Service' },
  { name: 'Cyient', type: 'Service' },
  { name: 'Sonata Software', type: 'Service' },
  { name: 'Birlasoft', type: 'Service' },
  { name: 'Quest Global', type: 'Service' },
  { name: 'Sasken', type: 'Service' },
  { name: 'Synechron', type: 'Service' },
  { name: 'Virtusa', type: 'Service' },
  { name: 'UST Global', type: 'Service' },
  { name: 'Thoughtworks', type: 'Service' },
  { name: 'GlobalLogic', type: 'Service' },
  { name: 'Nagarro', type: 'Service' },
  { name: 'Impetus', type: 'Service' },
  { name: 'Xoriant', type: 'Service' },
  { name: 'Fractal Analytics', type: 'Service' },
  { name: 'Tiger Analytics', type: 'Service' },
  { name: 'LatentView', type: 'Service' },
  { name: 'Quantiphi', type: 'Service' },
  { name: 'Sigmoid', type: 'Service' },
  { name: 'CitiusTech', type: 'Service' },
  { name: 'Indegene', type: 'Service' },
  { name: 'Publicis Sapient', type: 'Service' },
  { name: 'Razorfish', type: 'Service' },
  { name: 'Digitas', type: 'Service' },
  { name: 'Valtech', type: 'Service' },
  { name: 'Epam', type: 'Service' },
  { name: 'Genpact', type: 'Service' },
  { name: 'NTT Data', type: 'Service' }
]

async function main() {
  const catalogPath = 'src/data/company-catalog.json'
  let catalogData = { companies: [] }
  
  try {
    const text = await readFile(catalogPath, 'utf-8')
    catalogData = JSON.parse(text)
  } catch (error) {
    console.log('No existing company catalog found, starting fresh.')
  }
  
  const existingMap = new Map()
  for (const c of catalogData.companies || []) {
    existingMap.set(c.name.toLowerCase(), c)
  }
  
  let addedCount = 0
  let updatedCount = 0
  
  for (const item of indianCompaniesToAdd) {
    const key = item.name.toLowerCase()
    if (existingMap.has(key)) {
      // Preserving the existing entry but checking if we can update the type or name formatting
      const existing = existingMap.get(key)
      if (!existing.source && item.type) {
        existing.type = item.type
        updatedCount++
      }
    } else {
      // Adding new company
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
      existingMap.set(key, {
        name: item.name,
        boardSlugGuess: slug,
        type: item.type || 'Product',
        source: null
      })
      addedCount++
    }
  }
  
  const updatedCompanies = Array.from(existingMap.values())
  updatedCompanies.sort((a, b) => a.name.localeCompare(b.name))
  
  const finalJson = {
    generatedAt: new Date().toISOString(),
    companyCatalogSize: updatedCompanies.length,
    companies: updatedCompanies
  }
  
  await writeFile(catalogPath, JSON.stringify(finalJson, null, 2) + '\n')
  console.log(`Merged India companies: Added ${addedCount} new companies, updated ${updatedCount} companies. Total size: ${updatedCompanies.length}`)
}

main().catch(console.error)
