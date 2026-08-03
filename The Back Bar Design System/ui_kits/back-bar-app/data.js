window.BB = (() => {
  const shelf = [
    { name: "Rye whiskey", brand: "Rittenhouse Bottled-in-Bond", volume: "750ml", remaining: "¾" },
    { name: "White rum", brand: "Plantation 3 Star", volume: "750ml", remaining: "½" },
    { name: "Cognac", brand: "Pierre Ferrand 1840", volume: "750ml", remaining: "⅔" },
    { name: "Gin", brand: "Beefeater", volume: "1L", remaining: "⅘" },
    { name: "Sweet vermouth", brand: "Cocchi di Torino", volume: "750ml", remaining: "⅓" },
    { name: "Dry vermouth", brand: "Dolin", volume: "375ml", remaining: "¼" },
    { name: "Angostura bitters", brand: "House", volume: "200ml", remaining: "⅞" },
    { name: "Lime juice", brand: "Fresh", volume: "—", remaining: "½" },
    { name: "Lemon juice", brand: "Fresh", volume: "—", remaining: "⅓" },
    { name: "Simple syrup", brand: "House 1:1", volume: "500ml", remaining: "⅔" },
    { name: "Demerara syrup", brand: "House 2:1", volume: "250ml", remaining: "¾" },
    { name: "Campari", brand: "Campari", volume: "750ml", remaining: "⅖" },
    { name: "Soda water", brand: "Topo Chico", volume: "355ml", remaining: "1" },
  ];
  const pantry = [
    "Orgeat", "Curaçao", "Cointreau", "Green Chartreuse", "Maraschino", "Aged rum",
    "Tequila", "Cream", "Egg white", "Orange flower water", "Absinthe", "Grapefruit juice",
    "Honey syrup", "Aperol", "Prosecco", "Bourbon", "Peychaud's bitters", "Bénédictine",
  ];
  const drinks = [
    { name: "Daiquiri", family: "Sour", ing: ["White rum", "Lime juice", "Simple syrup"], ratio: [["2","Rum"],["¾","Lime"],["¾","Syrup"]], note: "The proof of a bar. If the rum is good, the drink is good." },
    { name: "Manhattan", family: "Old Fashioned", ing: ["Rye whiskey", "Sweet vermouth", "Angostura bitters"], ratio: [["2","Rye"],["1","Vermouth"],["2","Dashes"]], note: "Stirred, never shaken. The vermouth lives in the fridge." },
    { name: "Sidecar", family: "Sour", ing: ["Cognac", "Lemon juice", "Cointreau"], ratio: [["2","Cognac"],["¾","Lemon"],["¾","Orange"]] },
    { name: "Negroni", family: "Old Fashioned", ing: ["Gin", "Campari", "Sweet vermouth"], ratio: [["1","Gin"],["1","Bitter"],["1","Vermouth"]], note: "Equal parts. Stir with a big cube; the dilution is the recipe." },
    { name: "Old Fashioned", family: "Old Fashioned", ing: ["Rye whiskey", "Demerara syrup", "Angostura bitters"], ratio: [["2","Rye"],["¼","Sugar"],["2","Dashes"]] },
    { name: "Martini", family: "Martini", ing: ["Gin", "Dry vermouth"], ratio: [["2½","Gin"],["¾","Vermouth"]] },
    { name: "Gin Rickey", family: "Highball", ing: ["Gin", "Lime juice", "Soda water"], ratio: [["2","Gin"],["¾","Lime"],["3","Soda"]] },
    { name: "Americano", family: "Highball", ing: ["Campari", "Sweet vermouth", "Soda water"], ratio: [["1","Bitter"],["1","Vermouth"],["3","Soda"]] },
    { name: "Whiskey Sour", family: "Sour", ing: ["Rye whiskey", "Lemon juice", "Simple syrup", "Egg white"], ratio: [["2","Rye"],["¾","Lemon"],["¾","Syrup"]] },
    { name: "Mai Tai", family: "Sour", ing: ["Aged rum", "Lime juice", "Orgeat", "Curaçao"], ratio: [["2","Rum"],["¾","Lime"],["½","Orgeat"],["½","Orange"]] },
    { name: "Last Word", family: "Sour", ing: ["Gin", "Green Chartreuse", "Maraschino", "Lime juice"], ratio: [["¾","Gin"],["¾","Herbal"],["¾","Maraschino"],["¾","Lime"]] },
    { name: "Corpse Reviver №2", family: "Sour", ing: ["Gin", "Cointreau", "Lemon juice", "Absinthe"], ratio: [["¾","Gin"],["¾","Orange"],["¾","Lemon"],["1","Dash"]] },
    { name: "Boulevardier", family: "Old Fashioned", ing: ["Bourbon", "Campari", "Sweet vermouth"], ratio: [["1½","Bourbon"],["1","Bitter"],["1","Vermouth"]] },
    { name: "Vieux Carré", family: "Old Fashioned", ing: ["Rye whiskey", "Cognac", "Sweet vermouth", "Bénédictine"], ratio: [["1","Rye"],["1","Cognac"],["1","Vermouth"],["½","Herbal"]] },
    { name: "Ramos Gin Fizz", family: "Flip", ing: ["Gin", "Cream", "Egg white", "Orange flower water", "Lemon juice"], ratio: [["2","Gin"],["1","Cream"],["½","Lemon"]] },
    { name: "Paloma", family: "Highball", ing: ["Tequila", "Grapefruit juice", "Lime juice", "Soda water"], ratio: [["2","Tequila"],["2","Grapefruit"],["½","Lime"]] },
  ];
  const families = ["All", "Sour", "Old Fashioned", "Highball", "Martini", "Flip"];
  return { shelf, pantry, drinks, families };
})();
