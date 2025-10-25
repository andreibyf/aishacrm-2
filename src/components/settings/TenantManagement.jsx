import React, { useState, useEffect, useMemo } from 'react';
import { Tenant } from '@/api/entities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Building2, Plus, Edit, Save, X, Loader2, AlertCircle, Copy } from 'lucide-react';
import { toast } from "sonner";
import { Alert, AlertDescription } from '@/components/ui/alert';

// Geographic data structures
const COUNTRIES_BY_REGION = {
  north_america: ['United States', 'Canada', 'Mexico'],
  europe: ['United Kingdom', 'Germany', 'France', 'Spain', 'Italy', 'Netherlands', 'Poland', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Belgium', 'Austria', 'Switzerland', 'Ireland', 'Portugal', 'Greece', 'Czech Republic', 'Romania', 'Hungary'],
  asia: ['China', 'Japan', 'India', 'South Korea', 'Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'Philippines', 'Vietnam', 'Taiwan', 'Hong Kong', 'UAE', 'Saudi Arabia', 'Israel', 'Turkey'],
  south_america: ['Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela', 'Ecuador', 'Uruguay', 'Paraguay', 'Bolivia'],
  africa: ['South Africa', 'Nigeria', 'Egypt', 'Kenya', 'Morocco', 'Ghana', 'Ethiopia', 'Tanzania', 'Uganda', 'Rwanda'],
  oceania: ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea'],
  global: [] // 'Global' geographic_focus means no specific country/city filter
};

const MAJOR_CITIES_BY_COUNTRY = {
  'United States': ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus', 'Charlotte', 'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Boston', 'Miami', 'Atlanta', 'Las Vegas', 'Portland', 'Detroit'],
  'Canada': ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa', 'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener'],
  'Mexico': ['Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana', 'León', 'Juárez', 'Zapopan', 'Mérida', 'Cancún'],
  'United Kingdom': ['London', 'Birmingham', 'Manchester', 'Glasgow', 'Liverpool', 'Edinburgh', 'Leeds', 'Bristol', 'Cardiff', 'Belfast'],
  'Germany': ['Berlin', 'Munich', 'Hamburg', 'Cologne', 'Frankfurt', 'Stuttgart', 'Düsseldorf', 'Dortmund', 'Essen', 'Leipzig'],
  'France': ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg', 'Montpellier', 'Bordeaux', 'Lille'],
  'Spain': ['Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga', 'Murcia', 'Palma', 'Bilbao', 'Alicante'],
  'Italy': ['Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna', 'Florence', 'Bari', 'Venice'],
  'Netherlands': ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen'],
  'Poland': ['Warsaw', 'Kraków', 'Łódź', 'Wrocław', 'Poznań', 'Gdańsk', 'Szczecin', 'Bydgoszcz', 'Lublin', 'Katowice'],
  'Sweden': ['Stockholm', 'Gothenburg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro', 'Linköping', 'Helsingborg'],
  'Norway': ['Oslo', 'Bergen', 'Stavanger', 'Trondheim', 'Drammen', 'Fredrikstad', 'Kristiansand', 'Sandnes'],
  'Denmark': ['Copenhagen', 'Aarhus', 'Odense', 'Aalborg', 'Esbjerg', 'Randers', 'Kolding', 'Horsens'],
  'Finland': ['Helsinki', 'Espoo', 'Tampere', 'Vantaa', 'Oulu', 'Turku', 'Jyväskylä', 'Lahti'],
  'Belgium': ['Brussels', 'Antwerp', 'Ghent', 'Charleroi', 'Liège', 'Bruges', 'Namur', 'Leuven'],
  'Austria': ['Vienna', 'Graz', 'Linz', 'Salzburg', 'Innsbruck', 'Klagenfurt', 'Villach', 'Wels'],
  'Switzerland': ['Zurich', 'Geneva', 'Basel', 'Lausanne', 'Bern', 'Winterthur', 'Lucerne', 'St. Gallen'],
  'Ireland': ['Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford', 'Drogheda', 'Dundalk', 'Swords'],
  'Portugal': ['Lisbon', 'Porto', 'Braga', 'Funchal', 'Coimbra', 'Setúbal', 'Almada', 'Aveiro'],
  'Greece': ['Athens', 'Thessaloniki', 'Patras', 'Heraklion', 'Larissa', 'Volos', 'Rhodes', 'Ioannina'],
  'Czech Republic': ['Prague', 'Brno', 'Ostrava', 'Plzeň', 'Liberec', 'Olomouc', 'České Budějovice', 'Hradec Králové'],
  'Romania': ['Bucharest', 'Cluj-Napoca', 'Timișoara', 'Iași', 'Constanța', 'Craiova', 'Brașov', 'Galați'],
  'Hungary': ['Budapest', 'Debrecen', 'Szeged', 'Miskolc', 'Pécs', 'Győr', 'Nyíregyháza', 'Kecskemét'],
  'China': ['Beijing', 'Shanghai', 'Guangzhou', 'Shenzhen', 'Chengdu', 'Hangzhou', 'Wuhan', 'Xi\'an', 'Chongqing', 'Tianjin'],
  'Japan': ['Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Sapporo', 'Fukuoka', 'Kobe', 'Kyoto', 'Kawasaki', 'Saitama'],
  'India': ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'],
  'South Korea': ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Daejeon', 'Gwangju', 'Suwon', 'Ulsan', 'Changwon', 'Goyang'],
  'Singapore': ['Singapore'],
  'Malaysia': ['Kuala Lumpur', 'George Town', 'Ipoh', 'Johor Bahru', 'Malacca', 'Kota Kinabalu', 'Shah Alam', 'Petaling Jaya'],
  'Thailand': ['Bangkok', 'Chiang Mai', 'Phuket', 'Pattaya', 'Hat Yai', 'Nakhon Ratchasima', 'Khon Kaen', 'Udon Thani'],
  'Indonesia': ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Semarang', 'Makassar', 'Palembang', 'Tangerang'],
  'Philippines': ['Manila', 'Quezon City', 'Davao', 'Cebu City', 'Zamboanga', 'Antipolo', 'Pasig', 'Cagayan de Oro'],
  'Vietnam': ['Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Hai Phong', 'Can Tho', 'Bien Hoa', 'Nha Trang', 'Hue'],
  'Taiwan': ['Taipei', 'Kaohsiung', 'Taichung', 'Tainan', 'Hsinchu', 'Taoyuan', 'Keelung', 'Chiayi'],
  'Hong Kong': ['Hong Kong'],
  'UAE': ['Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'],
  'Saudi Arabia': ['Riyadh', 'Jeddah', 'Mecca', 'Medina', 'Dammam', 'Khobar', 'Tabuk', 'Buraidah'],
  'Israel': ['Tel Aviv', 'Jerusalem', 'Haifa', 'Rishon LeZion', 'Petah Tikva', 'Ashdod', 'Netanya', 'Beersheba'],
  'Turkey': ['Istanbul', 'Ankara', 'Izmir', 'Bursa', 'Adana', 'Gaziantep', 'Konya', 'Antalya'],
  'Brazil': ['São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza', 'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Porto Alegre'],
  'Argentina': ['Buenos Aires', 'Córdoba', 'Rosario', 'Mendoza', 'San Miguel de Tucumán', 'La Plata', 'Mar del Plata', 'Salta'],
  'Chile': ['Santiago', 'Valparaíso', 'Concepción', 'La Serena', 'Antofagasta', 'Temuco', 'Rancagua', 'Talca'],
  'Colombia': ['Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena', 'Cúcuta', 'Bucaramanga', 'Pereira'],
  'Peru': ['Lima', 'Arequipa', 'Trujillo', 'Chiclayo', 'Piura', 'Iquitos', 'Cusco', 'Huancayo'],
  'Venezuela': ['Caracas', 'Maracaibo', 'Valencia', 'Barquisimeto', 'Maracay', 'Ciudad Guayana', 'Barcelona', 'Maturín'],
  'Ecuador': ['Guayaquil', 'Quito', 'Cuenca', 'Santo Domingo', 'Machala', 'Manta', 'Portoviejo', 'Loja'],
  'Uruguay': ['Montevideo', 'Salto', 'Paysandú', 'Las Piedras', 'Rivera', 'Maldonado', 'Tacuarembó', 'Melo'],
  'Paraguay': ['Asunción', 'Ciudad del Este', 'San Lorenzo', 'Luque', 'Capiatá', 'Lambaré', 'Fernando de la Mora', 'Limpio'],
  'Bolivia': ['La Paz', 'Santa Cruz', 'Cochabamba', 'Sucre', 'Oruro', 'Tarija', 'Potosí', 'Trinidad'],
  'South Africa': ['Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth', 'Bloemfontein', 'East London', 'Nelspruit'],
  'Nigeria': ['Lagos', 'Kano', 'Ibadan', 'Abuja', 'Port Harcourt', 'Benin City', 'Kaduna', 'Maiduguri'],
  'Egypt': ['Cairo', 'Alexandria', 'Giza', 'Shubra El Kheima', 'Port Said', 'Suez', 'Luxor', 'Aswan'],
  'Kenya': ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Ruiru', 'Kikuyu', 'Kangundo-Tala'],
  'Morocco': ['Casablanca', 'Rabat', 'Fez', 'Marrakesh', 'Agadir', 'Tangier', 'Meknès', 'Oujda'],
  'Ghana': ['Accra', 'Kumasi', 'Tamale', 'Takoradi', 'Ashaiman', 'Tema', 'Teshi Old Town', 'Cape Coast'],
  'Ethiopia': ['Addis Ababa', 'Dire Dawa', 'Mek\'ele', 'Gondar', 'Bahir Dar', 'Hawassa', 'Dessie', 'Jimma'],
  'Tanzania': ['Dar es Salaam', 'Mwanza', 'Arusha', 'Dodoma', 'Mbeya', 'Morogoro', 'Tanga', 'Zanzibar City'],
  'Uganda': ['Kampala', 'Gulu', 'Lira', 'Mbarara', 'Jinja', 'Bwizibwera', 'Mbale', 'Mukono'],
  'Rwanda': ['Kigali', 'Butare', 'Gitarama', 'Ruhengeri', 'Gisenyi', 'Byumba', 'Cyangugu', 'Kibuye'],
  'Australia': ['Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast', 'Canberra', 'Newcastle', 'Wollongong', 'Hobart'],
  'New Zealand': ['Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga', 'Dunedin', 'Palmerston North', 'Napier'],
  'Fiji': ['Suva', 'Lautoka', 'Nadi', 'Labasa', 'Ba', 'Sigatoka', 'Tavua', 'Nausori'],
  'Papua New Guinea': ['Port Moresby', 'Lae', 'Arawa', 'Mount Hagen', 'Madang', 'Wewak', 'Goroka', 'Popondetta']
};

const TenantForm = ({ tenant, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: tenant?.name || '',
    domain: tenant?.domain || '',
    logo_url: tenant?.logo_url || '',
    primary_color: tenant?.primary_color || '#3b82f6',
    accent_color: tenant?.accent_color || '#f59e0b',
    industry: tenant?.industry || 'other',
    business_model: tenant?.business_model || 'b2b',
    geographic_focus: tenant?.geographic_focus || 'north_america',
    country: tenant?.country || '',
    major_city: tenant?.major_city || '',
    elevenlabs_agent_id: tenant?.elevenlabs_agent_id || '',
    display_order: tenant?.display_order || 0
  });
  const [saving, setSaving] = useState(false);

  // Filter countries based on geographic focus
  const availableCountries = useMemo(() => formData.geographic_focus === 'global'
    ? []
    : COUNTRIES_BY_REGION[formData.geographic_focus] || [], [formData.geographic_focus]);

  // Filter cities based on selected country
  const availableCities = useMemo(() => formData.country
    ? MAJOR_CITIES_BY_COUNTRY[formData.country] || []
    : [], [formData.country]);

  // Reset country and city when geographic focus changes
  useEffect(() => {
    // If geographic focus is 'global', country and city should be cleared
    if (formData.geographic_focus === 'global') {
      setFormData(prev => ({ ...prev, country: '', major_city: '' }));
    }
    // If a country is selected but is no longer valid for the new geographic focus, clear it
    else if (formData.country && !availableCountries.includes(formData.country)) {
      setFormData(prev => ({ ...prev, country: '', major_city: '' }));
    }
  }, [formData.geographic_focus, formData.country, availableCountries]);

  // Reset city when country changes
  useEffect(() => {
    // If a city is selected but is no longer valid for the new country, clear it
    if (formData.major_city && !availableCities.includes(formData.major_city)) {
      setFormData(prev => ({ ...prev, major_city: '' }));
    }
  }, [formData.country, formData.major_city, availableCities]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  return (
    <Dialog open={!!tenant} onOpenChange={onCancel}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tenant?.id ? 'Edit Tenant' : 'Create New Tenant'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Tenant Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Acme Corp"
                required
              />
            </div>
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={formData.domain}
                onChange={(e) => setFormData({...formData, domain: e.target.value})}
                placeholder="acme.com"
              />
            </div>
          </div>

          {tenant?.id && (
            <div className="bg-blue-900/20 p-3 rounded border border-blue-700/50">
              <Label className="text-blue-300 font-medium">Tenant ID</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input
                  readOnly
                  value={tenant.id}
                  className="bg-slate-800 border-slate-700 text-cyan-300 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => copyToClipboard(tenant.id, 'Tenant ID')}
                >
                  <Copy className="w-4 h-4 text-slate-400" />
                </Button>
              </div>
              <p className="text-xs text-blue-400 mt-1">Use this ID in your ElevenLabs webhook URL</p>
            </div>
          )}

          <div>
            <Label htmlFor="elevenlabs_agent_id">ElevenLabs Agent ID</Label>
            <Input
              id="elevenlabs_agent_id"
              value={formData.elevenlabs_agent_id}
              onChange={(e) => setFormData({...formData, elevenlabs_agent_id: e.target.value})}
              placeholder="se8ujo4HwtLbAg1GMvuX"
            />
            <p className="text-xs text-slate-400 mt-1">The unique Agent ID from your ElevenLabs conversational AI</p>
          </div>

          <div>
            <Label htmlFor="logo_url">Logo URL</Label>
            <Input
              id="logo_url"
              value={formData.logo_url}
              onChange={(e) => setFormData({...formData, logo_url: e.target.value})}
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="primary_color">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={formData.primary_color}
                  onChange={(e) => setFormData({...formData, primary_color: e.target.value})}
                  className="w-16 h-10"
                />
                <Input
                  value={formData.primary_color}
                  onChange={(e) => setFormData({...formData, primary_color: e.target.value})}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="accent_color">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={formData.accent_color}
                  onChange={(e) => setFormData({...formData, accent_color: e.target.value})}
                  className="w-16 h-10"
                />
                <Input
                  value={formData.accent_color}
                  onChange={(e) => setFormData({...formData, accent_color: e.target.value})}
                  placeholder="#f59e0b"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="industry">Industry</Label>
              <Select value={formData.industry} onValueChange={(value) => setFormData({...formData, industry: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accounting_and_finance">Accounting & Finance</SelectItem>
                  <SelectItem value="aerospace_and_defense">Aerospace & Defense</SelectItem>
                  <SelectItem value="agriculture_and_farming">Agriculture & Farming</SelectItem>
                  <SelectItem value="automotive_and_transportation">Automotive & Transportation</SelectItem>
                  <SelectItem value="banking_and_financial_services">Banking & Financial Services</SelectItem>
                  <SelectItem value="biotechnology_and_pharmaceuticals">Biotechnology & Pharmaceuticals</SelectItem>
                  <SelectItem value="chemicals_and_materials">Chemicals & Materials</SelectItem>
                  <SelectItem value="construction_and_engineering">Construction & Engineering</SelectItem>
                  <SelectItem value="consulting_and_professional_services">Consulting & Professional Services</SelectItem>
                  <SelectItem value="consumer_goods_and_retail">Consumer Goods & Retail</SelectItem>
                  <SelectItem value="cybersecurity">Cybersecurity</SelectItem>
                  <SelectItem value="data_analytics_and_business_intelligence">Data Analytics & Business Intelligence</SelectItem>
                  <SelectItem value="education_and_training">Education & Training</SelectItem>
                  <SelectItem value="energy_oil_and_gas">Energy, Oil & Gas</SelectItem>
                  <SelectItem value="entertainment_and_media">Entertainment & Media</SelectItem>
                  <SelectItem value="environmental_services">Environmental Services</SelectItem>
                  <SelectItem value="event_management">Event Management</SelectItem>
                  <SelectItem value="fashion_and_apparel">Fashion & Apparel</SelectItem>
                  <SelectItem value="food_and_beverage">Food & Beverage</SelectItem>
                  <SelectItem value="franchising">Franchising</SelectItem>
                  <SelectItem value="gaming_and_esports">Gaming & Esports</SelectItem>
                  <SelectItem value="government_and_public_sector">Government & Public Sector</SelectItem>
                  <SelectItem value="green_energy_and_solar">Green Energy & Solar</SelectItem>
                  <SelectItem value="healthcare_and_medical_services">Healthcare & Medical Services</SelectItem>
                  <SelectItem value="hospitality_and_tourism">Hospitality & Tourism</SelectItem>
                  <SelectItem value="human_resources_and_staffing">Human Resources & Staffing</SelectItem>
                  <SelectItem value="information_technology_and_software">Information Technology & Software</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="interior_design_and_architecture">Interior Design & Architecture</SelectItem>
                  <SelectItem value="legal_services">Legal Services</SelectItem>
                  <SelectItem value="logistics_and_supply_chain">Logistics & Supply Chain</SelectItem>
                  <SelectItem value="manufacturing_industrial">Manufacturing (Industrial)</SelectItem>
                  <SelectItem value="marketing_advertising_and_pr">Marketing, Advertising & PR</SelectItem>
                  <SelectItem value="mining_and_metals">Mining & Metals</SelectItem>
                  <SelectItem value="nonprofit_and_ngos">Nonprofit & NGOs</SelectItem>
                  <SelectItem value="packaging_and_printing">Packaging & Printing</SelectItem>
                  <SelectItem value="pharmaceuticals">Pharmaceuticals</SelectItem>
                  <SelectItem value="real_estate_and_property_management">Real Estate & Property Management</SelectItem>
                  <SelectItem value="renewable_energy">Renewable Energy</SelectItem>
                  <SelectItem value="research_and_development">Research & Development</SelectItem>
                  <SelectItem value="retail_and_wholesale">Retail & Wholesale</SelectItem>
                  <SelectItem value="robotics_and_automation">Robotics & Automation</SelectItem>
                  <SelectItem value="saas_and_cloud_services">SaaS & Cloud Services</SelectItem>
                  <SelectItem value="security_services">Security Services</SelectItem>
                  <SelectItem value="social_media_and_influencer">Social Media & Influencer</SelectItem>
                  <SelectItem value="sports_and_recreation">Sports & Recreation</SelectItem>
                  <SelectItem value="telecommunications">Telecommunications</SelectItem>
                  <SelectItem value="textiles_and_apparel">Textiles & Apparel</SelectItem>
                  <SelectItem value="transportation_and_delivery">Transportation & Delivery</SelectItem>
                  <SelectItem value="utilities_water_and_waste">Utilities (Water & Waste)</SelectItem>
                  <SelectItem value="veterinary_services">Veterinary Services</SelectItem>
                  <SelectItem value="warehousing_and_distribution">Warehousing & Distribution</SelectItem>
                  <SelectItem value="wealth_management">Wealth Management</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="business_model">Business Model</Label>
              <Select value={formData.business_model} onValueChange={(value) => setFormData({...formData, business_model: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="b2b">B2B</SelectItem>
                  <SelectItem value="b2c">B2C</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="geographic_focus">Geographic Focus</Label>
              <Select value={formData.geographic_focus} onValueChange={(value) => setFormData({...formData, geographic_focus: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="north_america">North America</SelectItem>
                  <SelectItem value="europe">Europe</SelectItem>
                  <SelectItem value="asia">Asia</SelectItem>
                  <SelectItem value="south_america">South America</SelectItem>
                  <SelectItem value="africa">Africa</SelectItem>
                  <SelectItem value="oceania">Oceania</SelectItem>
                  <SelectItem value="global">Global</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Country and Major City - only show if not Global */}
          {formData.geographic_focus !== 'global' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="country">Country</Label>
                <Select
                  value={formData.country}
                  onValueChange={(value) => setFormData({...formData, country: value, major_city: ''})} // Clear city when country changes
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {availableCountries.length > 0 ? (
                      availableCountries.map(country => (
                        <SelectItem key={country} value={country}>{country}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value={null} disabled>No countries available for this region</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="major_city">Major City</Label>
                <Select
                  value={formData.major_city}
                  onValueChange={(value) => setFormData({...formData, major_city: value})}
                  disabled={!formData.country || availableCities.length === 0} // Disable if no country selected or no cities available
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formData.country ? (availableCities.length > 0 ? "Select city" : "No major cities listed for this country") : "Select country first"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {availableCities.length > 0 ? (
                      availableCities.map(city => (
                        <SelectItem key={city} value={city}>{city}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value={null} disabled>No major cities listed</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {saving ? 'Saving...' : 'Save Tenant'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default function TenantManagement() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTenant, setEditingTenant] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const loadTenants = async () => {
    try {
      const fetchedTenants = await Tenant.list();
      setTenants(fetchedTenants.sort((a, b) => (a.display_order || 0) - (b.display_order || 0)));
    } catch (error) {
      console.error('Failed to load tenants:', error);
      toast.error('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleSave = async (formData) => {
    try {
      if (editingTenant) {
        await Tenant.update(editingTenant.id, formData);
        toast.success('Tenant updated successfully');
      } else {
        await Tenant.create(formData);
        toast.success('Tenant created successfully');
      }
      setEditingTenant(null);
      setShowCreateDialog(false);
      loadTenants();
    } catch (error) {
      console.error('Failed to save tenant:', error);
      toast.error('Failed to save tenant');
    }
  };

  const handleCancel = () => {
    setEditingTenant(null);
    setShowCreateDialog(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        <span className="ml-3 text-slate-400">Loading tenants...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Client Organizations</h3>
          <p className="text-sm text-slate-400">Manage your client tenants and their AI agent configurations</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="w-4 h-4 mr-2" />
          Add Tenant
        </Button>
      </div>

      {tenants.length === 0 ? (
        <Alert className="bg-slate-800 border-slate-700">
          <Building2 className="h-4 w-4 text-slate-400" />
          <AlertDescription className="text-slate-300">
            No tenants configured yet. Create your first client organization to get started.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700">
                <TableHead className="text-slate-300">Name</TableHead>
                <TableHead className="text-slate-300">Industry</TableHead>
                <TableHead className="text-slate-300">Location</TableHead> {/* New column */}
                <TableHead className="text-slate-300">AI Agent</TableHead>
                <TableHead className="text-slate-300">Business Model</TableHead>
                <TableHead className="text-slate-300">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id} className="border-slate-700">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {tenant.logo_url ? (
                        <img src={tenant.logo_url} alt={tenant.name} className="w-8 h-8 rounded object-contain bg-white" />
                      ) : (
                        <div className="w-8 h-8 bg-slate-700 rounded flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-slate-400" />
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-slate-200">{tenant.name}</p>
                        {tenant.domain && (
                          <p className="text-xs text-slate-500">{tenant.domain}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-slate-300 border-slate-600">
                      {tenant.industry?.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-slate-300">
                      {tenant.major_city && tenant.country ? (
                        <div>
                          <p className="font-medium">{tenant.major_city}</p>
                          <p className="text-xs text-slate-500">{tenant.country}</p>
                        </div>
                      ) : tenant.country ? (
                        <p>{tenant.country}</p>
                      ) : tenant.geographic_focus && tenant.geographic_focus !== 'global' ? (
                        <p className="text-slate-500">{tenant.geographic_focus.replace(/_/g, ' ')}</p>
                      ) : (
                        <p className="text-slate-500">Global</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {tenant.elevenlabs_agent_id ? (
                      <Badge className="bg-green-900/50 text-green-300 border-green-700">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-300 border-orange-600">
                        Not Set
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-slate-300 border-slate-600">
                      {tenant.business_model?.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingTenant(tenant)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {(editingTenant || showCreateDialog) && (
        <TenantForm
          tenant={editingTenant || {}}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
