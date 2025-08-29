import { useEffect, useRef, useState } from 'react';
import * as braintreeWeb from 'braintree-web';
import Select from 'react-select';
import { allCountries } from 'country-region-data';

export default function Checkout() {
  const [clientToken, setClientToken] = useState(null);
  const [hostedFieldsInstance, setHostedFieldsInstance] = useState(null);
  const [threeDS, setThreeDS] = useState(null);
  const deviceDataRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState('');

  // Billing info
  const [billing, setBilling] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    streetAddress: '',
    extendedAddress: '',
    locality: '',
    region: '',
    postalCode: '',
    countryCodeAlpha2: '',
    email: ''
  });


  // Build country options (with embedded regions)
  const countryOptions = allCountries.map(
    ([countryName, countryCode, regions]) => ({
      value: countryCode,
      label: countryName,
      regions: regions.map(r => ({ value: r[1], label: r[0] }))
    })
  );

  // Find selected country (for region dropdown)
  const selectedCountry = countryOptions.find(
    c => c.value === billing.countryCodeAlpha2
  );

  console.log(billing, selectedCountry?.regions);


  useEffect(() => {
    (async () => {
      try {
        const tokenResp = await fetch(
          'http://localhost:4000/api/braintree/client-token'
        ).then(r => r.json());
        setClientToken(tokenResp.clientToken);

        const clientInstance = await braintreeWeb.client.create({
          authorization: tokenResp.clientToken
        });

        const dc = await braintreeWeb.dataCollector.create({
          client: clientInstance,
          kount: true
        });
        deviceDataRef.current = dc.deviceData;

        const threeDSInstance = await braintreeWeb.threeDSecure.create({
          version: 2,
          client: clientInstance
        });
        setThreeDS(threeDSInstance);

        const hf = await braintreeWeb.hostedFields.create({
          client: clientInstance,
          styles: {
            'input': { 'font-size': '13px',
              'font-weight': '600' ,
              color:'#1f2937'
             },
            '.valid': { color: '#16a34a' },
            '.invalid': { color: '#dc2626' },
            'input::placeholder': {
               'font-size': '13px',
              'color': '#4b5563' ,
              'font-weight': '600'
            },
          },
          fields: {
            number: {
              selector: '#card-number',
              placeholder: 'CC Number'
            },
            expirationDate: {
              selector: '#expiration-date',
              placeholder: 'CC Expiration'
            },
            cvv: { selector: '#cvv', placeholder: 'CVV' }
          }
        });
        setHostedFieldsInstance(hf);

        setLoading(false);
      } catch (e) {
        console.error(e);
        setStatus('Failed to init payment form.');
      }
    })();
  }, []);

  const handlePay = async e => {
    e.preventDefault();
    if (!hostedFieldsInstance || !threeDS) return;

    setStatus('Tokenizing card...');
    try {
      const hostedFieldsTokenizationPayload =
        await hostedFieldsInstance.tokenize({ vault: false });
      setStatus('Running 3D Secure...');

      const threeDSPayload = await threeDS.verifyCard({
        amount,
        nonce: hostedFieldsTokenizationPayload.nonce,
        bin: hostedFieldsTokenizationPayload.details.bin,
        email: billing.email,
        billingAddress: {
          givenName: billing.firstName,
          surname: billing.lastName,
          phoneNumber: billing.phoneNumber,
          streetAddress: billing.streetAddress,
          extendedAddress: billing.extendedAddress,
          locality: billing.locality,
          region: billing.region,
          postalCode: billing.postalCode,
          countryCodeAlpha2: billing.countryCodeAlpha2
        },
        additionalInformation: {
          shippingGivenName: billing.firstName,
          shippingSurname: billing.lastName,
          shippingAddress: {
            streetAddress: billing.streetAddress,
            extendedAddress: billing.extendedAddress,
            locality: billing.locality,
            region: billing.region,
            postalCode: billing.postalCode,
            countryCodeAlpha2: billing.countryCodeAlpha2
          },
          shippingPhone: billing.phoneNumber
        },
        onLookupComplete: (data, next) => next()
      });

      setStatus('Creating transaction...');
      const resp = await fetch(
        'http://localhost:4000/api/braintree/checkout',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount,
            paymentMethodNonce: threeDSPayload.nonce,
            deviceData: deviceDataRef.current,
            orderId: `order_${Date.now()}`,
            currency: 'USD',
            threeDSecureRequired: true,
            billing
          })
        }
      ).then(r => r.json());

      if (resp.ok) {
        setStatus(`Success! TXN ID: ${resp.transaction?.id}`);
      } else {
        setStatus(`Declined or error: ${resp.message || resp.error}`);
      }
    } catch (err) {
      console.error(err);
      setStatus(err?.message || 'Payment failed.');
    }
  };

  return (
    <>
      <div className="max-w-md mx-auto px-6 py-3 bg-white rounded-2xl shadow mt-1">
        <h1 className='text-center font-semibold text-gray-900 text-xl mb-3'>Checkout</h1>

        {/* Amount */}
        {/* <label className="block text-sm mb-2">Amount (USD)</label> */}
        <input
          className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600 mb-4"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />

        {/* Billing form */}
        <div className="space-y-3 mb-6">
          {/* First + Last name */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <input
              placeholder="First Name"
              className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600"
              value={billing.firstName}
              onChange={e =>
                setBilling({ ...billing, firstName: e.target.value })
              }
            />
            <input
              placeholder="Last Name"
              className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600"
              value={billing.lastName}
              onChange={e =>
                setBilling({ ...billing, lastName: e.target.value })
              }
            />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <input
              placeholder="Email"
              className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600"
              value={billing.email}
              onChange={e =>
                setBilling({ ...billing, email: e.target.value })
              }
            />
            <input
              placeholder="Phone"
              className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600"
              value={billing.phoneNumber}
              onChange={e =>
                setBilling({ ...billing, phoneNumber: e.target.value })
              }
            />
          </div>

          <input
            placeholder="Street Address"
            className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600"
            value={billing.streetAddress}
            onChange={e =>
              setBilling({ ...billing, streetAddress: e.target.value })
            }
          />

          <input
            placeholder="Apt / Suite"
            className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600"
            value={billing.extendedAddress}
            onChange={e =>
              setBilling({ ...billing, extendedAddress: e.target.value })
            }
          />

          <input
            placeholder="City / Locality"
            className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600"
            value={billing.locality}
            onChange={e =>
              setBilling({ ...billing, locality: e.target.value })
            }
          />

          {/* Country + State */}
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <Select
              options={countryOptions}
              value={selectedCountry || null}
              onChange={val =>
                setBilling({
                  ...billing,
                  countryCodeAlpha2: val.value,
                  region: "",
                })
              }
              placeholder="Country"
            />
            <Select
              options={selectedCountry?.regions || []}
              value={
                billing.region
                  ? { value: billing.region, label: billing.region }
                  : null
              }
              onChange={val =>
                setBilling({ ...billing, region: val ? val.value : "" })
              }
              placeholder="Region"
              isDisabled={!selectedCountry}
            />
          </div>

          <input
            placeholder="Postal Code"
            className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600"
            value={billing.postalCode}
            onChange={e =>
              setBilling({ ...billing, postalCode: e.target.value })
            }
          />
        </div>

        {/* Card fields */}
        <form onSubmit={handlePay} className="space-y-4">
            <div
              id="card-number"
              className="rounded px-3  py-1.5 h-[34px] border-2 border-gray-700"
            ></div>
          <div className="grid grid-cols-2 gap-4">
              <div
                id="expiration-date"
                className="brounded px-3 py-1.5 h-[34px] border-2 border-gray-700"
              ></div>
              <div
                id="cvv"
                className="rounded px-3 p-1.5 h-[34px] border-2 border-gray-700 hover:border-gray-700 placeholder:text-gray-600 text-gray-800"
              ></div>
          </div>

          <button
            disabled={loading}
            className="w-full bg-black text-white rounded py-3 hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Pay Now"}
          </button>
        </form>

        <p className="text-sm text-gray-600 mt-4">{status}</p>
      </div>
    </>
  );
}



// import { useEffect, useRef, useState } from 'react';
// import * as braintreeWeb from 'braintree-web';

// export default function Checkout() {
//   const [clientToken, setClientToken] = useState(null);
//   const [hostedFieldsInstance, setHostedFieldsInstance] = useState(null);
//   const [threeDS, setThreeDS] = useState(null);
//   const deviceDataRef = useRef(null);
//   const [loading, setLoading] = useState(true);
//   const [amount, setAmount] = useState('');
//   const [status, setStatus] = useState('');

//   useEffect(() => {
//     (async () => {
//       try {
//         const tokenResp = await fetch('http://localhost:4000/api/braintree/client-token').then(r => r.json());
//         setClientToken(tokenResp.clientToken);

//         const clientInstance = await braintreeWeb.client.create({
//           authorization: tokenResp.clientToken,
//         });

//         // Device data (Kount) for fraud signals
//         const dc = await braintreeWeb.dataCollector.create({
//           client: clientInstance,
//           kount: true,
//         });
//         deviceDataRef.current = dc.deviceData;

//         // 3D Secure v2
//         const threeDSInstance = await braintreeWeb.threeDSecure.create({
//           version: 2,
//           client: clientInstance,
//         });
//         setThreeDS(threeDSInstance);

//         // Hosted Fields
//         const hf = await braintreeWeb.hostedFields.create({
//           client: clientInstance,
//           styles: {
//             'input': { 'font-size': '14px' },
//             '.valid': { 'color': '#16a34a' },     // Tailwind green-600
//             '.invalid': { 'color': '#dc2626' },   // Tailwind red-600
//           },
//           fields: {
//             number: {
//               selector: '#card-number',
//               placeholder: '4111 1111 1111 1111',
//             },
//             expirationDate: {
//               selector: '#expiration-date',
//               placeholder: 'MM/YY',
//             },
//             cvv: {
//               selector: '#cvv',
//               placeholder: '123',
//             },
//           },
//         });
//         setHostedFieldsInstance(hf);

//         setLoading(false);
//       } catch (e) {
//         console.error(e);
//         setStatus('Failed to init payment form.');
//       }
//     })();
//   }, []);

//   const handlePay = async (e) => {
//     e.preventDefault();
//     if (!hostedFieldsInstance || !threeDS) return;

//     setStatus('Tokenizing card...');
//     try {
//       const hostedFieldsTokenizationPayload = await hostedFieldsInstance.tokenize({ vault: false });
//       // 3DS verification
//       setStatus('Running 3D Secure...');

//         const threeDSPayload = await threeDS.verifyCard({
//                 amount,
//                 nonce: hostedFieldsTokenizationPayload.nonce,
//                 bin: hostedFieldsTokenizationPayload.details.bin,
//                 email: 'test@example.com',
//                 billingAddress: {
//                     givenName: 'Jill',
//                     surname: 'Doe',
//                     phoneNumber: '8101234567',
//                     streetAddress: '555 Smith St.',
//                     extendedAddress: '#5',
//                     locality: 'Oakland',
//                     region: 'CA',
//                     postalCode: '12345',
//                     countryCodeAlpha2: 'US'
//                 },
//                 additionalInformation: {
//                     workPhoneNumber: '5555555555',
//                     shippingGivenName: 'Jill',
//                     shippingSurname: 'Doe',
//                     shippingAddress: {
//                         streetAddress: '555 Smith st',
//                         extendedAddress: '#5',
//                         locality: 'Oakland',
//                         region: 'CA',
//                         postalCode: '12345',
//                         countryCodeAlpha2: 'US'
//                     },
//                     shippingPhone: '8101234567',
//                 },
//                 onLookupComplete: (data, next) => {
//                     next(); // continue to possible challenge
//                 },

//             })

//       setStatus('Creating transaction...');
//       const resp = await fetch('http://localhost:4000/api/braintree/checkout', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           amount,
//           paymentMethodNonce: threeDSPayload.nonce, // use 3DS nonce
//           deviceData: deviceDataRef.current,
//           orderId: `order_${Date.now()}`,
//           currency: 'USD',
//           threeDSecureRequired: true,
//           billing: {
//             firstName: 'John',
//             lastName: 'Doe',
//             locality: 'New York',
//             region: 'NY',
//             postalCode: '10001',
//             countryCodeAlpha2: 'US',
//           },
//         }),
//       }).then(r => r.json());

//       if (resp.ok) {
//         setStatus(`Success! TXN ID: ${resp.transaction?.id}`);
//       } else {
//         setStatus(`Declined or error: ${resp.message || resp.error}`);
//       }
//     } catch (err) {
//       console.error(err);
//       setStatus(err?.message || 'Payment failed.');
//     }
//   };

//   return (
//     <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow mt-20">
//       <h2 className="text-xl font-semibold mb-4">Pay with Card</h2>

//       <label className="block text-sm mb-2">Amount (USD)</label>
//       <input
//         className="w-full border-2 border-gray-700 placeholder:text-gray-600 text-gray-800 rounded px-3 py-1.5 text-sm font-semibold  focus:ring-0 focus:outline-none focus:border-green-600 mb-4"
//         value={amount}
//         onChange={e => setAmount(e.target.value)}
//       />

//       <form onSubmit={handlePay} className="space-y-4">
//         <div>
//           <label className="block text-sm mb-1">Card Number</label>
//           <div id="card-number" className="border rounded px-3 py-1.5 h-10"></div>
//         </div>
//         <div className="grid grid-cols-2 gap-4">
//           <div>
//             <label className="block text-sm mb-1">Expiry</label>
//             <div id="expiration-date" className="border rounded px-3 py-1.5 h-10"></div>
//           </div>
//           <div>
//             <label className="block text-sm mb-1">CVV</label>
//             <div id="cvv" className="border rounded px-3 py-1.5 h-10"></div>
//           </div>
//         </div>

//         <button
//           disabled={loading}
//           className="w-full bg-black text-white rounded-xl py-3 hover:opacity-90 disabled:opacity-50"
//         >
//           {loading ? 'Loading…' : 'Pay Now'}
//         </button>
//       </form>

//       <p className="text-sm text-gray-600 mt-4">{status}</p>
//     </div>
//   );
// }
