import subprocess
import sys

def run(command):
    result = subprocess.run(command, shell=True)
    if result.returncode != 0:
        print(f"Erro ao executar: {command}")
        sys.exit(1)

def main():
    arquivo = input("📄 Digite o caminho do arquivo (ex: src/index.html): ").strip()
    if not arquivo:
        print("❌ O arquivo não pode ser vazio.")
        sys.exit(1)

    branch = input("🌿 Digite o nome do branch (ex: dev): ").strip()
    if not branch:
        print("❌ O branch não pode ser vazio.")
        sys.exit(1)

    message = input("💬 Digite a mensagem do commit: ").strip()
    if not message:
        print("❌ A mensagem do commit não pode ser vazia.")
        sys.exit(1)

    run("git remote set-url origin https://github.com/HenzoPaes/Anime_website.git")

    # Garante que está no branch correto
    print(f"🌿 Mudando para o branch '{branch}'...")
    run(f"git checkout -B {branch}")

    # Adiciona APENAS o arquivo específico
    print(f"🔄 Adicionando apenas '{arquivo}'...")
    run(f'git add "{arquivo}"')

    print("📝 Criando commit...")
    run(f'git commit --allow-empty -m "{message}"')

    print(f"🚀 Enviando para o branch '{branch}'...")
    run(f"git push origin {branch}")

    print("✅ Processo concluído com sucesso!")

if __name__ == "__main__":
    main()