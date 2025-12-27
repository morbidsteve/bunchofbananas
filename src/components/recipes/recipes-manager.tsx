'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  type UserRecipeWithIngredients,
  type ParsedIngredient,
  RECIPE_CATEGORIES,
  CUISINES,
  normalizeIngredientName,
  hasIngredient,
} from '@/types/recipes'

interface RecipesManagerProps {
  recipes: UserRecipeWithIngredients[]
  inventoryItems: string[]
  householdId: string
  userId: string
}

interface IngredientFormItem {
  id: string
  name: string
  quantity: string
  unit: string
  notes: string
}

const initialFormData = {
  title: '',
  description: '',
  instructions: '',
  category: '',
  cuisine: '',
  prepTime: '',
  cookTime: '',
  servings: '',
}

export function RecipesManager({
  recipes,
  inventoryItems,
  householdId,
  userId,
}: RecipesManagerProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [textImportOpen, setTextImportOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<UserRecipeWithIngredients | null>(null)
  const [viewingRecipe, setViewingRecipe] = useState<UserRecipeWithIngredients | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState(initialFormData)
  const [ingredients, setIngredients] = useState<IngredientFormItem[]>([
    { id: '1', name: '', quantity: '', unit: '', notes: '' },
  ])
  const [importText, setImportText] = useState('')
  const [parsing, setParsing] = useState(false)

  // OCR state
  const [ocrImportOpen, setOcrImportOpen] = useState(false)
  const [ocrProcessing, setOcrProcessing] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrText, setOcrText] = useState('')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Filter recipes
  const filteredRecipes = recipes.filter((recipe) => {
    const matchesSearch =
      recipe.title.toLowerCase().includes(search.toLowerCase()) ||
      recipe.description?.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = !categoryFilter || recipe.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  // Calculate match percentage for a recipe
  function getRecipeMatch(recipe: UserRecipeWithIngredients) {
    const total = recipe.recipe_ingredients?.length || 0
    if (total === 0) return { matched: 0, total: 0, percentage: 0 }

    const matched = recipe.recipe_ingredients.filter((ing) =>
      hasIngredient(ing.name, inventoryItems)
    ).length

    return {
      matched,
      total,
      percentage: Math.round((matched / total) * 100),
    }
  }

  function getMatchBadgeColor(percentage: number) {
    if (percentage >= 70) return 'bg-green-500'
    if (percentage >= 40) return 'bg-yellow-500'
    return 'bg-gray-400'
  }

  function addIngredient() {
    setIngredients([
      ...ingredients,
      { id: Date.now().toString(), name: '', quantity: '', unit: '', notes: '' },
    ])
  }

  function removeIngredient(id: string) {
    if (ingredients.length > 1) {
      setIngredients(ingredients.filter((i) => i.id !== id))
    }
  }

  function updateIngredient(id: string, field: keyof IngredientFormItem, value: string) {
    setIngredients(
      ingredients.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    )
  }

  function resetForm() {
    setFormData(initialFormData)
    setIngredients([{ id: '1', name: '', quantity: '', unit: '', notes: '' }])
    setEditingRecipe(null)
  }

  function openEditDialog(recipe: UserRecipeWithIngredients) {
    setEditingRecipe(recipe)
    setFormData({
      title: recipe.title,
      description: recipe.description || '',
      instructions: recipe.instructions,
      category: recipe.category || '',
      cuisine: recipe.cuisine || '',
      prepTime: recipe.prep_time_minutes?.toString() || '',
      cookTime: recipe.cook_time_minutes?.toString() || '',
      servings: recipe.servings?.toString() || '',
    })
    setIngredients(
      recipe.recipe_ingredients.map((ing) => ({
        id: ing.id,
        name: ing.name,
        quantity: ing.quantity || '',
        unit: ing.unit || '',
        notes: ing.notes || '',
      }))
    )
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const validIngredients = ingredients.filter((i) => i.name.trim())

    const payload = {
      title: formData.title,
      description: formData.description,
      instructions: formData.instructions,
      category: formData.category || null,
      cuisine: formData.cuisine || null,
      prepTime: formData.prepTime,
      cookTime: formData.cookTime,
      servings: formData.servings,
      ingredients: validIngredients.map((i) => ({
        name: i.name,
        quantity: i.quantity || null,
        unit: i.unit || null,
        notes: i.notes || null,
      })),
      sourceType: 'manual' as const,
    }

    try {
      const url = editingRecipe
        ? `/api/recipes/user/${editingRecipe.id}`
        : '/api/recipes/user'
      const method = editingRecipe ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save recipe')
      }

      toast.success(editingRecipe ? 'Recipe updated!' : 'Recipe created!')
      setDialogOpen(false)
      resetForm()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save recipe')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(recipeId: string) {
    if (!confirm('Are you sure you want to delete this recipe?')) return

    try {
      const response = await fetch(`/api/recipes/user/${recipeId}`, {
        method: 'DELETE',
      })

      if (!response.ok) throw new Error('Failed to delete recipe')

      toast.success('Recipe deleted')
      setViewingRecipe(null)
      router.refresh()
    } catch {
      toast.error('Failed to delete recipe')
    }
  }

  async function handleTextImport() {
    if (!importText.trim()) return

    setParsing(true)
    try {
      const response = await fetch('/api/recipes/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText }),
      })

      if (!response.ok) throw new Error('Failed to parse recipe')

      const parsed = await response.json()

      setFormData({
        ...initialFormData,
        title: parsed.title || '',
        instructions: parsed.instructions || importText,
      })

      setIngredients(
        parsed.ingredients?.length > 0
          ? parsed.ingredients.map((ing: ParsedIngredient, idx: number) => ({
              id: idx.toString(),
              name: ing.name,
              quantity: ing.quantity || '',
              unit: ing.unit || '',
              notes: ing.notes || '',
            }))
          : [{ id: '1', name: '', quantity: '', unit: '', notes: '' }]
      )

      setTextImportOpen(false)
      setDialogOpen(true)
      setImportText('')
      toast.success('Recipe parsed! Review and adjust as needed.')
    } catch {
      toast.error('Failed to parse recipe text')
    } finally {
      setParsing(false)
    }
  }

  async function handleShareToggle(recipe: UserRecipeWithIngredients) {
    const supabase = createClient()
    const newPublicState = !recipe.is_public

    const { error } = await supabase
      .from('user_recipes')
      .update({ is_public: newPublicState })
      .eq('id', recipe.id)

    if (error) {
      toast.error('Failed to update sharing')
      return
    }

    toast.success(newPublicState ? 'Recipe is now public!' : 'Recipe is now private')
    router.refresh()
  }

  function copyShareLink(recipe: UserRecipeWithIngredients) {
    const url = `${window.location.origin}/recipe/${recipe.share_token}`
    navigator.clipboard.writeText(url)
    toast.success('Share link copied!')
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      setSelectedImage(reader.result as string)
      setOcrText('')
      setOcrProgress(0)
    }
    reader.readAsDataURL(file)
  }

  async function handleOcrExtract() {
    if (!selectedImage) return

    setOcrProcessing(true)
    setOcrProgress(0)

    try {
      const Tesseract = (await import('tesseract.js')).default

      const result = await Tesseract.recognize(selectedImage, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100))
          }
        },
      })

      setOcrText(result.data.text)
      toast.success('Text extracted! Review and edit as needed.')
    } catch (error) {
      console.error('OCR error:', error)
      toast.error('Failed to extract text from image')
    } finally {
      setOcrProcessing(false)
    }
  }

  async function handleOcrImport() {
    if (!ocrText.trim()) return

    setParsing(true)
    try {
      const response = await fetch('/api/recipes/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: ocrText }),
      })

      if (!response.ok) throw new Error('Failed to parse recipe')

      const parsed = await response.json()

      setFormData({
        ...initialFormData,
        title: parsed.title || '',
        instructions: parsed.instructions || ocrText,
      })

      setIngredients(
        parsed.ingredients?.length > 0
          ? parsed.ingredients.map((ing: ParsedIngredient, idx: number) => ({
              id: idx.toString(),
              name: ing.name,
              quantity: ing.quantity || '',
              unit: ing.unit || '',
              notes: ing.notes || '',
            }))
          : [{ id: '1', name: '', quantity: '', unit: '', notes: '' }]
      )

      setOcrImportOpen(false)
      setDialogOpen(true)
      setOcrText('')
      setSelectedImage(null)
      toast.success('Recipe parsed! Review and adjust as needed.')
    } catch {
      toast.error('Failed to parse recipe text')
    } finally {
      setParsing(false)
    }
  }

  function resetOcrState() {
    setSelectedImage(null)
    setOcrText('')
    setOcrProgress(0)
    setOcrProcessing(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Recipes</h1>
          <p className="text-gray-600 mt-1">
            Your personal recipe collection
          </p>
        </div>
        <div className="flex gap-2">
          {/* OCR Import Button and Dialog */}
          <Dialog open={ocrImportOpen} onOpenChange={(open) => {
            setOcrImportOpen(open)
            if (!open) resetOcrState()
          }}>
            <DialogTrigger asChild>
              <Button variant="outline">Import Image</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Recipe from Image</DialogTitle>
                <DialogDescription>
                  Upload a photo of a recipe and we&apos;ll extract the text using OCR
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-32 border-dashed"
                  disabled={ocrProcessing}
                >
                  {selectedImage ? 'Change Image' : 'Click to Select Image'}
                </Button>

                {/* Image Preview */}
                {selectedImage && (
                  <div className="relative">
                    <img
                      src={selectedImage}
                      alt="Recipe preview"
                      className="max-h-48 mx-auto rounded-lg object-contain"
                    />
                    {!ocrText && (
                      <Button
                        onClick={handleOcrExtract}
                        disabled={ocrProcessing}
                        className="mt-4 w-full bg-amber-500 hover:bg-amber-600"
                      >
                        {ocrProcessing ? `Extracting... ${ocrProgress}%` : 'Extract Text'}
                      </Button>
                    )}
                  </div>
                )}

                {/* Progress bar */}
                {ocrProcessing && (
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-amber-500 h-2 rounded-full transition-all"
                      style={{ width: `${ocrProgress}%` }}
                    />
                  </div>
                )}

                {/* Extracted Text */}
                {ocrText && (
                  <div className="space-y-2">
                    <Label>Extracted Text (edit if needed)</Label>
                    <Textarea
                      value={ocrText}
                      onChange={(e) => setOcrText(e.target.value)}
                      className="min-h-[200px] font-mono text-sm"
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setOcrImportOpen(false)
                      resetOcrState()
                    }}
                  >
                    Cancel
                  </Button>
                  {ocrText && (
                    <Button
                      onClick={handleOcrImport}
                      disabled={parsing || !ocrText.trim()}
                      className="bg-amber-500 hover:bg-amber-600"
                    >
                      {parsing ? 'Parsing...' : 'Parse Recipe'}
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Text Import Dialog */}
          <Dialog open={textImportOpen} onOpenChange={setTextImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">Import Text</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Recipe from Text</DialogTitle>
                <DialogDescription>
                  Paste a recipe and we&apos;ll try to extract the title, ingredients, and
                  instructions
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste your recipe here...

Example:
Chocolate Chip Cookies

Ingredients:
2 cups flour
1 cup butter
1 cup sugar
2 eggs
1 tsp vanilla
1 cup chocolate chips

Instructions:
1. Mix butter and sugar until fluffy.
2. Add eggs and vanilla.
3. Fold in flour and chocolate chips.
4. Bake at 350°F for 12 minutes."
                  className="min-h-[300px]"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setTextImportOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleTextImport}
                    disabled={parsing || !importText.trim()}
                    className="bg-amber-500 hover:bg-amber-600"
                  >
                    {parsing ? 'Parsing...' : 'Parse Recipe'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) resetForm()
          }}>
            <DialogTrigger asChild>
              <Button className="bg-amber-500 hover:bg-amber-600">
                + Add Recipe
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingRecipe ? 'Edit Recipe' : 'Add New Recipe'}
                </DialogTitle>
                <DialogDescription>
                  {editingRecipe
                    ? 'Update your recipe details'
                    : 'Create a new recipe for your collection'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="Grandma's Famous Cookies"
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="A brief description of your recipe"
                  />
                </div>

                {/* Category and Cuisine */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={formData.category}
                      onValueChange={(v) =>
                        setFormData({ ...formData, category: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {RECIPE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cuisine</Label>
                    <Select
                      value={formData.cuisine}
                      onValueChange={(v) =>
                        setFormData({ ...formData, cuisine: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select cuisine" />
                      </SelectTrigger>
                      <SelectContent>
                        {CUISINES.map((cuisine) => (
                          <SelectItem key={cuisine} value={cuisine}>
                            {cuisine}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Time and Servings */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="prepTime">Prep (min)</Label>
                    <Input
                      id="prepTime"
                      type="number"
                      min="0"
                      value={formData.prepTime}
                      onChange={(e) =>
                        setFormData({ ...formData, prepTime: e.target.value })
                      }
                      placeholder="15"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cookTime">Cook (min)</Label>
                    <Input
                      id="cookTime"
                      type="number"
                      min="0"
                      value={formData.cookTime}
                      onChange={(e) =>
                        setFormData({ ...formData, cookTime: e.target.value })
                      }
                      placeholder="30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="servings">Servings</Label>
                    <Input
                      id="servings"
                      type="number"
                      min="1"
                      value={formData.servings}
                      onChange={(e) =>
                        setFormData({ ...formData, servings: e.target.value })
                      }
                      placeholder="4"
                    />
                  </div>
                </div>

                {/* Ingredients */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Ingredients *</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addIngredient}
                    >
                      + Add
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {ingredients.map((ing, idx) => (
                      <div key={ing.id} className="flex gap-2 items-start">
                        <Input
                          value={ing.quantity}
                          onChange={(e) =>
                            updateIngredient(ing.id, 'quantity', e.target.value)
                          }
                          placeholder="1"
                          className="w-16"
                        />
                        <Input
                          value={ing.unit}
                          onChange={(e) =>
                            updateIngredient(ing.id, 'unit', e.target.value)
                          }
                          placeholder="cup"
                          className="w-20"
                        />
                        <Input
                          value={ing.name}
                          onChange={(e) =>
                            updateIngredient(ing.id, 'name', e.target.value)
                          }
                          placeholder="flour"
                          className="flex-1"
                          required={idx === 0}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeIngredient(ing.id)}
                          disabled={ingredients.length === 1}
                          className="text-red-500"
                        >
                          X
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Instructions */}
                <div className="space-y-2">
                  <Label htmlFor="instructions">Instructions *</Label>
                  <Textarea
                    id="instructions"
                    value={formData.instructions}
                    onChange={(e) =>
                      setFormData({ ...formData, instructions: e.target.value })
                    }
                    placeholder="Step-by-step cooking instructions..."
                    className="min-h-[150px]"
                    required
                  />
                </div>

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false)
                      resetForm()
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="bg-amber-500 hover:bg-amber-600"
                    disabled={loading}
                  >
                    {loading
                      ? 'Saving...'
                      : editingRecipe
                      ? 'Update Recipe'
                      : 'Save Recipe'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 flex-wrap">
        <Input
          placeholder="Search recipes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {RECIPE_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Recipes Grid */}
      {filteredRecipes.length === 0 ? (
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="text-4xl mb-4">📖</div>
              <h3 className="text-lg font-semibold mb-2">
                {search || categoryFilter ? 'No matching recipes' : 'No recipes yet'}
              </h3>
              <p className="text-gray-600">
                {search || categoryFilter
                  ? 'Try a different search or filter'
                  : 'Add your first recipe to get started!'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecipes.map((recipe) => {
            const match = getRecipeMatch(recipe)
            return (
              <Card
                key={recipe.id}
                className="hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setViewingRecipe(recipe)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg line-clamp-1">
                      {recipe.title}
                    </CardTitle>
                    {recipe.is_public && (
                      <Badge variant="outline" className="text-xs">
                        Public
                      </Badge>
                    )}
                  </div>
                  {recipe.description && (
                    <CardDescription className="line-clamp-2">
                      {recipe.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 flex-wrap">
                    {recipe.category && (
                      <Badge variant="secondary">{recipe.category}</Badge>
                    )}
                    {recipe.cuisine && (
                      <Badge variant="outline">{recipe.cuisine}</Badge>
                    )}
                    <Badge className={getMatchBadgeColor(match.percentage)}>
                      {match.matched}/{match.total} in stock
                    </Badge>
                  </div>
                  {(recipe.prep_time_minutes || recipe.cook_time_minutes) && (
                    <p className="text-sm text-gray-500 mt-2">
                      {recipe.prep_time_minutes && `Prep: ${recipe.prep_time_minutes}min`}
                      {recipe.prep_time_minutes && recipe.cook_time_minutes && ' • '}
                      {recipe.cook_time_minutes && `Cook: ${recipe.cook_time_minutes}min`}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Recipe Detail Modal */}
      <Dialog open={!!viewingRecipe} onOpenChange={() => setViewingRecipe(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewingRecipe && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-xl">
                      {viewingRecipe.title}
                    </DialogTitle>
                    {viewingRecipe.description && (
                      <DialogDescription>
                        {viewingRecipe.description}
                      </DialogDescription>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-4">
                {/* Meta info */}
                <div className="flex items-center gap-2 flex-wrap">
                  {viewingRecipe.category && (
                    <Badge variant="secondary">{viewingRecipe.category}</Badge>
                  )}
                  {viewingRecipe.cuisine && (
                    <Badge variant="outline">{viewingRecipe.cuisine}</Badge>
                  )}
                  {viewingRecipe.servings && (
                    <Badge variant="outline">
                      {viewingRecipe.servings} servings
                    </Badge>
                  )}
                </div>

                {/* Time */}
                {(viewingRecipe.prep_time_minutes ||
                  viewingRecipe.cook_time_minutes) && (
                  <p className="text-sm text-gray-600">
                    {viewingRecipe.prep_time_minutes &&
                      `Prep: ${viewingRecipe.prep_time_minutes} min`}
                    {viewingRecipe.prep_time_minutes &&
                      viewingRecipe.cook_time_minutes &&
                      ' | '}
                    {viewingRecipe.cook_time_minutes &&
                      `Cook: ${viewingRecipe.cook_time_minutes} min`}
                  </p>
                )}

                {/* Ingredients */}
                <div>
                  <h4 className="font-semibold mb-2">Ingredients</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {viewingRecipe.recipe_ingredients.map((ing) => {
                      const inStock = hasIngredient(ing.name, inventoryItems)
                      return (
                        <div
                          key={ing.id}
                          className={`p-2 rounded text-sm ${
                            inStock
                              ? 'bg-green-50 text-green-800'
                              : 'bg-gray-50 text-gray-600'
                          }`}
                        >
                          <span className="mr-1">{inStock ? '✓' : '○'}</span>
                          {ing.quantity && `${ing.quantity} `}
                          {ing.unit && `${ing.unit} `}
                          {ing.name}
                          {ing.notes && (
                            <span className="text-gray-500"> ({ing.notes})</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Instructions */}
                <div>
                  <h4 className="font-semibold mb-2">Instructions</h4>
                  <div className="text-sm text-gray-700 whitespace-pre-line">
                    {viewingRecipe.instructions}
                  </div>
                </div>

                {/* Sharing */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Share this recipe</p>
                      <p className="text-sm text-gray-500">
                        {viewingRecipe.is_public
                          ? 'Anyone with the link can view'
                          : 'Only household members can see'}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShareToggle(viewingRecipe)}
                    >
                      {viewingRecipe.is_public ? 'Make Private' : 'Make Public'}
                    </Button>
                  </div>
                  {viewingRecipe.is_public && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => copyShareLink(viewingRecipe)}
                    >
                      Copy Share Link
                    </Button>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setViewingRecipe(null)
                      openEditDialog(viewingRecipe)
                    }}
                  >
                    Edit Recipe
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => handleDelete(viewingRecipe.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
