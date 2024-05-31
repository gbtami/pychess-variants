FROM python:3.12

COPY requirements.txt /app/

WORKDIR /app

RUN pip install -r requirements.txt

COPY lang /app/lang/
COPY server /app/server/
COPY static /app/static/
COPY templates /app/templates/
COPY variants.ini /app/

EXPOSE 8080

CMD ["python", "server/server.py", "-v"]
