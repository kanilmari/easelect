// // fetch_table_view.js

// export async function fetchDefaultViewName(table_name) {
//     try {
//       const response = await fetch(`/api/get-table-view?table=${encodeURIComponent(table_name)}`, {
//         method: 'GET',
//         credentials: 'include'
//       });
//       if (!response.ok) {
//         console.error("virhe: fetch_table_view ei palauttanut OK-statusta:", response.status);
//         return null;
//       }
//       const metaData = await response.json();
//       if (metaData && metaData.data && metaData.data.length > 0) {
//         return metaData.data[0].default_view_name;
//       }
//       // Jos dataa ei ollut, palautetaan null
//       return null;
//     } catch (error) {
//       console.error("virhe fetchDefaultViewName-funktiossa:", error);
//       return null;
//     }
//   }