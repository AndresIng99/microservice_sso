FROM nginx:alpine

# Copiar configuración personalizada
COPY nginx.conf /etc/nginx/nginx.conf

# Crear directorio para SSL (opcional)
RUN mkdir -p /etc/nginx/ssl

# Exponer puertos
EXPOSE 80 443

# Comando por defecto
CMD ["nginx", "-g", "daemon off;"]