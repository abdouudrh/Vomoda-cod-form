import { useEffect, useState } from "react";

export default function ProxyCodCheckoutPage() {
  const [message, setMessage] = useState("Chargement...");

  useEffect(() => {
    async function testCart() {
      try {
        const res = await fetch(window.location.origin + "/cart.js", {
          headers: { Accept: "application/json" },
        });

        setMessage('cart.js status: ${res.status}');

        const text = await res.text();
        console.log("cart.js raw response:", text);
      } catch (error) {
        console.error("cart.js error:", error);
        setMessage("Erreur pendant le chargement du panier");
      }
    }

    testCart();
  }, []);

  return (
    <div style={{ padding: "40px", fontFamily: "Arial, sans-serif" }}>
      <h1>COD PAGE WORKING</h1>
      <p>{message}</p>
    </div>
  );
}