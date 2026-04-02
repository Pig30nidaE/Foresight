import re

path = '../frontend/src/features/dashboard/components/GameHistorySection.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

# match arrowContextMove
pattern = r"// selectedMove\.fen_after 이후의 다음 착수예정자.*?const arrowContextMove =[^;]+;"
text = re.sub(pattern, "", text, flags=re.DOTALL)

# replace inside arrows logic
text = text.replace("if (!arrowContextMove) return [];", "if (!selectedMove) return [];")
text = text.replace("const tier = arrowContextMove.tier;", "const tier = selectedMove.tier;")
text = text.replace("arrowContextMove.user_move_rank", "selectedMove.user_move_rank")
text = text.replace("arrowContextMove.is_only_best", "selectedMove.is_only_best")
text = text.replace("arrowContextMove.top_moves?", "selectedMove.top_moves?")

# match the color logic
pattern2 = r"// 화살표 색상:.*?\n\s*const isWhiteMove = arrowContextMove\.halfmove % 2 === 0;\n\s*const arrowColor = isWhiteMove \? [^;]+;"
new_color_code = """// 화살표 색상: 흰색/검은색 화살표를 해당 유저 색상에 매칭
                    const arrowColor = selectedMove.color === "white" ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.7)";"""

text = re.sub(pattern2, new_color_code, text, flags=re.DOTALL)

with open(path, "w", encoding="utf-8") as f:
    f.write(text)

print("Patched!")
