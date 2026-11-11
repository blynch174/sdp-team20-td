## Copy contents of .env.example into a .env file on your local machine

## Get the Docker running
docker compose up -d --build

## Check that all four containers are running
docker compose ps

## Check each URL to see if its running
1. Open http://localhost:5000/health. You should see {"status":"ok","service":"Mock OWL DMS"}. This is the fake car.

2. Open http://localhost:8000/api/health. You should see "OK". This is the backend.

3. Open http://localhost:8000/api/ducks. You should see {"ducks":["DUCK0001"]}. This means data made it into Redis.

4. Open http://localhost:8000/api/DUCK0001/metrics/rpm. You should see a list of timestamped RPM values, updating once per second.

5. Open http://localhost:3000. That’s the dashboard, with 9 charts updating live.

## Useful commands for Docker

docker compose logs -f backend    # watch one service's logs (Ctrl+C to stop watching)
docker compose logs -f            # watch everything
docker compose restart backend    # restart one service
docker compose down               # stop everything
docker compose up -d --build      # rebuild after changing requirements.txt or package.json

