import React, { useEffect } from "react";

export default function ModalHost({ id = "app-modal-host" }) {
  useEffect(() => {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      // Neutral, invisible container
      el.style.position = "relative";
      el.style.zIndex = "2147483000"; // ensure modals can sit above app
      document.body.appendChild(el);
      console.log("[ModalHost] created:", id, el);
    } else {
      console.log("[ModalHost] already present:", id);
    }
  }, [id]);

  return null;
}