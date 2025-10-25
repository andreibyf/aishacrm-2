import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { states } from "./statesData";
import { countries } from "./countriesData";

export default function AddressFields({ formData, handleChange, darkMode = false }) {
  const inputClassName = darkMode 
    ? "bg-slate-700 border-slate-600 text-slate-200 placeholder:text-slate-400 focus:border-slate-500"
    : "";
  
  const labelClassName = darkMode ? "text-slate-200" : "";

  const handleStateChange = (value) => {
    console.log('AddressFields: State selected:', value);
    const selectedState = states.find(state => state.code === value);
    if (value && selectedState) {
      handleChange('state', value);
    }
  };

  const handleCountryChange = (value) => {
    console.log('AddressFields: Country selected:', value);
    const selectedCountry = countries.find(country => country.code === value);
    if (value && selectedCountry) {
      handleChange('country', selectedCountry.name);
    }
  };

  // Find the current country by name to set the correct value
  const currentCountry = countries.find(country => country.name === formData.country);

  return (
    <>
      <div className="md:col-span-2">
        <Label htmlFor="address_1" className={labelClassName}>Address Line 1</Label>
        <Input
          id="address_1"
          value={formData.address_1 || ''}
          onChange={(e) => handleChange('address_1', e.target.value)}
          placeholder="Street address"
          className={`mt-1 ${inputClassName}`}
        />
      </div>
      
      <div className="md:col-span-2">
        <Label htmlFor="address_2" className={labelClassName}>Address Line 2</Label>
        <Input
          id="address_2"
          value={formData.address_2 || ''}
          onChange={(e) => handleChange('address_2', e.target.value)}
          placeholder="Apt, suite, floor (optional)"
          className={`mt-1 ${inputClassName}`}
        />
      </div>
      
      <div>
        <Label htmlFor="city" className={labelClassName}>City</Label>
        <Input
          id="city"
          value={formData.city || ''}
          onChange={(e) => handleChange('city', e.target.value)}
          className={`mt-1 ${inputClassName}`}
        />
      </div>
      
      <div>
        <Label htmlFor="state" className={labelClassName}>State/Province</Label>
        <Select 
          value={formData.state || ''} 
          onValueChange={handleStateChange}
          key={formData.state || 'empty'}
        >
          <SelectTrigger className={`mt-1 ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : ''}`}>
            <SelectValue placeholder="Select state..." />
          </SelectTrigger>
          <SelectContent className={darkMode ? "bg-slate-800 border-slate-700 text-slate-200" : ""}>
            {states.map((state) => (
              <SelectItem 
                key={state.code}
                value={state.code}
                className={darkMode ? "text-slate-200 hover:bg-slate-700 focus:bg-slate-700" : ""}
              >
                {state.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      
      <div>
        <Label htmlFor="zip" className={labelClassName}>ZIP/Postal Code</Label>
        <Input
          id="zip"
          value={formData.zip || ''}
          onChange={(e) => handleChange('zip', e.target.value)}
          className={`mt-1 ${inputClassName}`}
        />
      </div>
      
      <div>
        <Label htmlFor="country" className={labelClassName}>Country</Label>
        <Select 
          value={currentCountry?.code || ''} 
          onValueChange={handleCountryChange}
          key={currentCountry?.code || 'empty'}
        >
          <SelectTrigger className={`mt-1 ${darkMode ? 'bg-slate-700 border-slate-600 text-slate-200' : ''}`}>
            <SelectValue placeholder="Select country..." />
          </SelectTrigger>
          <SelectContent className={darkMode ? "bg-slate-800 border-slate-700 text-slate-200" : ""}>
            {countries.map((country) => (
              <SelectItem 
                key={country.code}
                value={country.code}
                className={darkMode ? "text-slate-200 hover:bg-slate-700 focus:bg-slate-700" : ""}
              >
                {country.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}