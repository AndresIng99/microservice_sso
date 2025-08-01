#!/bin/sh
echo "🚀 Iniciando backend..."
echo "⏳ Esperando base de datos..."
sleep 10

echo "📦 Reseteando y sincronizando esquema de base de datos..."
npx prisma db push --force-reset --accept-data-loss

echo "🌱 Ejecutando seed..."
npx prisma db seed

echo "✅ Backend listo!"
exec "$@"