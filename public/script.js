async function loadProperties() {
  try {
    const res = await fetch("http://localhost:4000/properties"); // now relative, no CORS issues
    const data = await res.json();

    const grid = document.getElementById("propertyGrid");
    grid.innerHTML = "";

    data.forEach(p => {
      const card = document.createElement("div");
      card.className = "card";

      const image = p.Photos?.length ? p.Photos[0].MediaURL : "https://via.placeholder.com/300x200?text=No+Image";

      card.innerHTML = `
        <img src="${image}" alt="Property" />
        <div class="card-content">
          <h2>${p.Property?.Address?.AddressText || "No Address"}</h2>
          <p><b>Price:</b> ${p.Property?.Price || "N/A"}</p>
          <p><b>Bedrooms:</b> ${p.Building?.Bedrooms || "N/A"}</p>
          <p><b>Bathrooms:</b> ${p.Building?.BathroomTotal || "N/A"}</p>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to load properties:", err);
  }
}

loadProperties();
