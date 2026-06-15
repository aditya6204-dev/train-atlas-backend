const express = require('express');
const cors = require('cors');
const xlsx = require('xlsx');
const Fuse = require('fuse.js');
const path = require('path');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

let db = { stations: [], trains: [], timetable: [] };
let stationSearchIndex = null;

function loadSingleExcelDatabase() {
  try {
    const workbookPath = path.join(__dirname, 'data', 'database.xlsx');
    const workbook = xlsx.readFile(workbookPath);

    db.stations = xlsx.utils.sheet_to_json(workbook.Sheets['Stations']);
    db.trains = xlsx.utils.sheet_to_json(workbook.Sheets['Trains']);
    db.timetable = xlsx.utils.sheet_to_json(workbook.Sheets['Timetable']);

    stationSearchIndex = new Fuse(db.stations, {
      threshold: 0.3,
      keys: [
        { name: 'station_code', weight: 0.7 },
        { name: 'station_name', weight: 0.3 }
      ]
    });

    console.log(`Database loaded: ${db.stations.length} stations parsed.`);
  } catch (err) {
    console.error("Error reading database.xlsx:", err.message);
  }
}

loadSingleExcelDatabase();

app.get('/api/stations/suggest', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const results = stationSearchIndex.search(q).slice(0, 8);
  return res.json(results.map(r => r.item));
});

app.get('/api/ta/calculate', (req, res) => {
  const { trainNo, fromCode, toCode } = req.query;
  const route = db.timetable.filter(r => r.train_no == trainNo);
  if (!route.length) return res.status(404).json({ error: "Train details missing." });

  const deptStation = route.find(r => r.station_code.toUpperCase() === fromCode.toUpperCase());
  const arrStation = route.find(r => r.station_code.toUpperCase() === toCode.toUpperCase());

  if (!deptStation || !arrStation) return res.status(400).json({ error: "Invalid station configuration." });
  const distanceKms = Math.abs(arrStation.distance_km - deptStation.distance_km);

  res.json({
    trainNo,
    timeLeft: deptStation.departure_time,
    timeArrived: arrStation.arrival_time,
    fromStation: deptStation.station_code,
    toStation: arrStation.station_code,
    kms: distanceKms,
    objectOfJourney: "On Duty"
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
