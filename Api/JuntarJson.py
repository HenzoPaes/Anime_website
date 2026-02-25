import os
import json

def merge_json_from_folder(folder_path, output_file="output.json"):
    if not os.path.exists(folder_path):
        print(f"❌ Pasta não encontrada: {folder_path}")
        return

    result = []

    for filename in os.listdir(folder_path):
        if filename.endswith(".json"):
            full_path = os.path.join(folder_path, filename)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                    # Se for lista, espalha
                    if isinstance(data, list):
                        result.extend(data)
                    else:
                        result.append(data)

            except Exception as e:
                print(f"⚠️ Erro ao ler {filename}: {e}")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ {len(result)} registros salvos em {output_file}")


# 👉 Caminho da pasta aqui
folder_path = "./api/Animes"

merge_json_from_folder(folder_path)