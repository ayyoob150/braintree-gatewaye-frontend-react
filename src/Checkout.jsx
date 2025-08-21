import { useEffect, useRef, useState } from 'react';
import * as braintreeWeb from 'braintree-web';

export default function Checkout() {
  const [clientToken, setClientToken] = useState(null);
  const [hostedFieldsInstance, setHostedFieldsInstance] = useState(null);
  const [threeDS, setThreeDS] = useState(null);
  const deviceDataRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('49.99');
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const tokenResp = await fetch('http://localhost:4000/api/braintree/client-token').then(r => r.json());
        setClientToken(tokenResp.clientToken);

        const clientInstance = await braintreeWeb.client.create({
          authorization: tokenResp.clientToken,
        });

        // Device data (Kount) for fraud signals
        const dc = await braintreeWeb.dataCollector.create({
          client: clientInstance,
          kount: true,
        });
        deviceDataRef.current = dc.deviceData;

        // 3D Secure v2
        const threeDSInstance = await braintreeWeb.threeDSecure.create({
          version: 2,
          client: clientInstance,
        });
        setThreeDS(threeDSInstance);

        // Hosted Fields
        const hf = await braintreeWeb.hostedFields.create({
          client: clientInstance,
          styles: {
            'input': { 'font-size': '14px' },
            '.valid': { 'color': '#16a34a' },     // Tailwind green-600
            '.invalid': { 'color': '#dc2626' },   // Tailwind red-600
          },
          fields: {
            number: {
              selector: '#card-number',
              placeholder: '4111 1111 1111 1111',
            },
            expirationDate: {
              selector: '#expiration-date',
              placeholder: 'MM/YY',
            },
            cvv: {
              selector: '#cvv',
              placeholder: '123',
            },
          },
        });
        setHostedFieldsInstance(hf);

        setLoading(false);
      } catch (e) {
        console.error(e);
        setStatus('Failed to init payment form.');
      }
    })();
  }, []);

  const handlePay = async (e) => {
    e.preventDefault();
    if (!hostedFieldsInstance || !threeDS) return;

    setStatus('Tokenizing card...');
    try {
      const hostedFieldsTokenizationPayload = await hostedFieldsInstance.tokenize({ vault: false });
      // 3DS verification
      setStatus('Running 3D Secure...');

        const threeDSPayload = await threeDS.verifyCard({
                amount,
                nonce: hostedFieldsTokenizationPayload.nonce,
                bin: hostedFieldsTokenizationPayload.details.bin,
                email: 'test@example.com',
                billingAddress: {
                    givenName: 'Jill',
                    surname: 'Doe',
                    phoneNumber: '8101234567',
                    streetAddress: '555 Smith St.',
                    extendedAddress: '#5',
                    locality: 'Oakland',
                    region: 'CA',
                    postalCode: '12345',
                    countryCodeAlpha2: 'US'
                },
                additionalInformation: {
                    workPhoneNumber: '5555555555',
                    shippingGivenName: 'Jill',
                    shippingSurname: 'Doe',
                    shippingAddress: {
                        streetAddress: '555 Smith st',
                        extendedAddress: '#5',
                        locality: 'Oakland',
                        region: 'CA',
                        postalCode: '12345',
                        countryCodeAlpha2: 'US'
                    },
                    shippingPhone: '8101234567',
                },
                onLookupComplete: (data, next) => {
                    next(); // continue to possible challenge
                },

            })

    //   const threeDSPayload = await threeDS.verifyCard({
    //     amount: amount,
    //     nonce,
    //     bin: details?.bin,
    //     additionalInformation: {
    //       // Add whatever you have; improves frictionless 3DS
    //       email: 'customer@example.com',
    //       billingAddress: {
    //         givenName: 'John',
    //         surname: 'Doe',
    //         phoneNumber: '5551234567',
    //         streetAddress: '123 Main St',
    //         locality: 'New York',
    //         region: 'NY',
    //         postalCode: '10001',
    //         countryCodeAlpha2: 'US',
    //       },
    //     },
    //     onLookupComplete: (data, next) => {
    //       next(); // continue to possible challenge
    //     },
    //   });

      setStatus('Creating transaction...');
      const resp = await fetch('http://localhost:4000/api/braintree/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMethodNonce: threeDSPayload.nonce, // use 3DS nonce
          deviceData: deviceDataRef.current,
          orderId: `order_${Date.now()}`,
          currency: 'USD',
          threeDSecureRequired: true,
          billing: {
            firstName: 'John',
            lastName: 'Doe',
            locality: 'New York',
            region: 'NY',
            postalCode: '10001',
            countryCodeAlpha2: 'US',
          },
        }),
      }).then(r => r.json());

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
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow mt-20">
      <h2 className="text-xl font-semibold mb-4">Pay with Card</h2>

      <label className="block text-sm mb-2">Amount (USD)</label>
      <input
        className="w-full border rounded-lg px-3 py-2 mb-4"
        value={amount}
        onChange={e => setAmount(e.target.value)}
      />

      <form onSubmit={handlePay} className="space-y-4">
        <div>
          <label className="block text-sm mb-1">Card Number</label>
          <div id="card-number" className="border rounded-lg px-3 py-2 h-10"></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Expiry</label>
            <div id="expiration-date" className="border rounded-lg px-3 py-2 h-10"></div>
          </div>
          <div>
            <label className="block text-sm mb-1">CVV</label>
            <div id="cvv" className="border rounded-lg px-3 py-2 h-10"></div>
          </div>
        </div>

        <button
          disabled={loading}
          className="w-full bg-black text-white rounded-xl py-3 hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Pay Now'}
        </button>
      </form>

      <p className="text-sm text-gray-600 mt-4">{status}</p>
    </div>
  );
}
